import { jest } from '@jest/globals'

const mockDebug = jest.fn()
const mockIsDebug = jest.fn().mockReturnValue(false)

const mockReaddirSync = jest.fn()
const mockLstatSync = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  debug: mockDebug,
  isDebug: mockIsDebug
}))

jest.unstable_mockModule('fs', () => ({
  default: {
    readdirSync: mockReaddirSync,
    lstatSync: mockLstatSync
  },
  readdirSync: mockReaddirSync,
  lstatSync: mockLstatSync
}))

const { listLocalFiles, globFilter, sortByGlob } =
  await import('../src/local.js')
const { SyncFile } = await import('../src/types.js')

describe('globFilter', () => {
  it('should include files matching include glob', () => {
    const filter = globFilter(['*.html', '*.js'], [])
    expect(filter('index.html')).toBe(true)
    expect(filter('app.js')).toBe(true)
  })

  it('should exclude files not matching any include glob', () => {
    const filter = globFilter(['*.html'], [])
    expect(filter('style.css')).toBe(false)
  })

  it('should exclude files matching exclude glob even if they match include', () => {
    const filter = globFilter(['*.js'], ['vendor.js'])
    expect(filter('vendor.js')).toBe(false)
    expect(filter('app.js')).toBe(true)
  })

  it('should support dot files', () => {
    const filter = globFilter(['*'], [])
    expect(filter('.hidden')).toBe(true)
  })

  it('should support matchBase (filename-only globs match in subdirs)', () => {
    const filter = globFilter(['*.html'], [])
    expect(filter('sub/dir/page.html')).toBe(true)
  })

  it('should match globs containing a slash against the full path', () => {
    const filter = globFilter(['_astro/**'], [])
    expect(filter('_astro/a.js')).toBe(true)
    expect(filter('_astro/sub/b.css')).toBe(true)
    expect(filter('index.html')).toBe(false)
    expect(filter('de/_astro/a.js')).toBe(false)
  })

  it('should match ** and **/*.html globs in subdirs', () => {
    const all = globFilter(['**/*'], [])
    expect(all('index.html')).toBe(true)
    expect(all('_astro/a.js')).toBe(true)
    expect(all('.well-known/x')).toBe(true)

    const html = globFilter(['**/*.html'], [])
    expect(html('index.html')).toBe(true)
    expect(html('de/index.html')).toBe(true)
    expect(html('_astro/a.js')).toBe(false)
  })

  it('should exclude by globs containing a slash', () => {
    const filter = globFilter(['**/*'], ['_astro/**'])
    expect(filter('_astro/a.js')).toBe(false)
    expect(filter('index.html')).toBe(true)
    expect(filter('de/index.html')).toBe(true)
  })

  it('should not log when debug logging is disabled', () => {
    mockDebug.mockClear()
    mockIsDebug.mockReturnValue(false)
    const filter = globFilter(['*.html'], ['vendor.js'])
    filter('index.html')
    filter('vendor.js')
    filter('style.css')
    expect(mockDebug).not.toHaveBeenCalled()
  })

  it('should log per file when debug logging is enabled', () => {
    mockDebug.mockClear()
    mockIsDebug.mockReturnValue(true)
    const filter = globFilter(['*.html'], [])
    filter('index.html')
    expect(mockDebug).toHaveBeenCalledTimes(1)
    mockIsDebug.mockReturnValue(false)
  })

  it('should never log when logging is turned off, even in debug mode', () => {
    mockDebug.mockClear()
    mockIsDebug.mockReturnValue(true)
    const filter = globFilter(['*.html'], [], false)
    filter('index.html')
    filter('style.css')
    expect(mockDebug).not.toHaveBeenCalled()
    mockIsDebug.mockReturnValue(false)
  })
})

describe('listLocalFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should list files recursively', () => {
    mockReaddirSync.mockImplementation((dirPath: string) => {
      if (dirPath === '.') return ['a.txt', 'sub']
      if (dirPath === 'sub') return ['b.txt']
      return []
    })
    mockLstatSync.mockImplementation((filePath: string) => {
      if (filePath === 'a.txt')
        return { isDirectory: () => false, isFile: () => true }
      if (filePath === 'sub')
        return { isDirectory: () => true, isFile: () => false }
      if (filePath === 'sub/b.txt')
        return { isDirectory: () => false, isFile: () => true }
      return { isDirectory: () => false, isFile: () => false }
    })

    const result = listLocalFiles('.')
    expect(result).toEqual(['a.txt', 'sub/b.txt'])
  })

  it('should return empty array for empty directory', () => {
    mockReaddirSync.mockReturnValue([])
    const result = listLocalFiles('.')
    expect(result).toEqual([])
  })

  it('should skip entries that are neither files nor directories', () => {
    mockReaddirSync.mockReturnValue(['link'])
    mockLstatSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => false
    })
    const result = listLocalFiles('.')
    expect(result).toEqual([])
  })
})

describe('sortByGlob', () => {
  function makeSyncFile(filename: string): SyncFile {
    const sf = new SyncFile(filename)
    Object.defineProperty(sf, 'size', { get: () => 100 })
    return sf
  }

  it('should sort files by glob priority', () => {
    const files = [
      makeSyncFile('style.css'),
      makeSyncFile('index.html'),
      makeSyncFile('app.js')
    ]

    const sorted = sortByGlob(files, ['*.html', '*.js', '*.css'])

    expect(sorted[0].filename).toBe('index.html')
    expect(sorted[1].filename).toBe('app.js')
    expect(sorted[2].filename).toBe('style.css')
  })

  it('should place unmatched files after matched files', () => {
    const files = [
      makeSyncFile('data.json'),
      makeSyncFile('index.html'),
      makeSyncFile('image.png')
    ]

    const sorted = sortByGlob(files, ['*.html'])

    expect(sorted[0].filename).toBe('index.html')
    expect(sorted.slice(1).map((f) => f.filename)).toEqual(
      expect.arrayContaining(['data.json', 'image.png'])
    )
  })

  it('should return files unchanged when order is empty', () => {
    const files = [
      makeSyncFile('c.txt'),
      makeSyncFile('a.txt'),
      makeSyncFile('b.txt')
    ]

    const sorted = sortByGlob(files, [])

    expect(sorted.map((f) => f.filename)).toEqual(['c.txt', 'a.txt', 'b.txt'])
  })

  it('should skip empty strings in order', () => {
    const files = [makeSyncFile('style.css'), makeSyncFile('index.html')]

    const sorted = sortByGlob(files, ['', '*.html', ''])

    expect(sorted[0].filename).toBe('index.html')
    expect(sorted[1].filename).toBe('style.css')
  })

  it('should sort by globs containing a slash', () => {
    const files = [
      makeSyncFile('de/index.html'),
      makeSyncFile('index.html'),
      makeSyncFile('_astro/a.js')
    ]

    const sorted = sortByGlob(files, ['_astro/**', '*.html'])

    expect(sorted.map((f) => f.filename)).toEqual([
      '_astro/a.js',
      'de/index.html',
      'index.html'
    ])
  })

  it('should support negated extglob order to put html last', () => {
    const files = [
      makeSyncFile('de/index.html'),
      makeSyncFile('index.html'),
      makeSyncFile('_astro/a.js'),
      makeSyncFile('robots.txt')
    ]

    const sorted = sortByGlob(files, ['!(*.html)'])

    expect(sorted.map((f) => f.filename)).toEqual([
      '_astro/a.js',
      'robots.txt',
      'de/index.html',
      'index.html'
    ])
  })

  it('should not mutate the original array', () => {
    const files = [makeSyncFile('b.css'), makeSyncFile('a.html')]

    const sorted = sortByGlob(files, ['*.html'])

    expect(files[0].filename).toBe('b.css')
    expect(sorted[0].filename).toBe('a.html')
  })
})
