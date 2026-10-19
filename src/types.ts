import fs from 'fs'
import picomatch from 'picomatch'
import { generateETag } from 's3-etag'

// While 5 MB is the minimum part size for a multipart upload,
// the current default part size used by AWS is 16 MB.
export const PART_SIZE = 16 * 1024 * 1024

export type RemoteFile = {
  size: number
  etag: string
}

// Globs without a slash match the basename in any directory; globs with a
// slash match the full relative path. picomatch's own `basename` option is
// applied to every glob (despite its docs), hence the explicit check.
export function globMatcher(glob: string): (input: string) => boolean {
  return picomatch(glob, { dot: true, basename: !glob.includes('/') })
}

export type RemoteFiles = {
  [key: string]: RemoteFile
}

export class SyncFile {
  private readonly _filename: string
  private _size?: number
  private _checksum?: string

  constructor(filename: string) {
    this._filename = filename
  }

  get filename(): string {
    return this._filename
  }

  get size(): number {
    if (this._size === undefined) {
      this._size = fs.statSync(this._filename).size
    }
    return this._size
  }

  get checksum(): string {
    if (this._checksum === undefined) {
      this._checksum = generateETag(this._filename, PART_SIZE)
    }
    return this._checksum
  }
}

export type CacheControl = {
  glob: string
  headerValue: string
}

export function formatSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return i === 0 ? `${size} ${units[i]}` : `${size.toFixed(1)} ${units[i]}`
}

export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function dryRunPrefix(dryRun: boolean): string {
  return dryRun ? '[DRY RUN] ' : ''
}
