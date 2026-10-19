import * as fs from 'fs'
import * as path from 'path'
import { debug } from './log.js'
import { globMatcher, SyncFile } from './types.js'

export function listLocalFiles(
  dirPath: string,
  results: string[] = []
): string[] {
  for (const file of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, file)
    const stats = fs.lstatSync(fullPath)
    if (stats.isDirectory()) {
      listLocalFiles(fullPath, results)
    } else if (stats.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

export function globFilter(
  includes: string[],
  excludes: string[],
  logDebug = true
): (p: string) => boolean {
  const excludeMatchers = excludes.map((e) => ({
    pattern: e,
    match: globMatcher(e)
  }))
  const includeMatchers = includes.map((i) => ({
    pattern: i,
    match: globMatcher(i)
  }))
  return (p: string) => {
    for (const { pattern, match } of excludeMatchers) {
      if (match(p)) {
        if (logDebug) debug(`File ${p} excluded by exclude glob ${pattern}`)
        return false
      }
    }
    for (const { pattern, match } of includeMatchers) {
      if (match(p)) {
        if (logDebug) debug(`File ${p} included by include glob ${pattern}`)
        return true
      }
    }
    if (logDebug) debug(`File ${p} excluded (no glob matched)`)
    return false
  }
}

export function sortByGlob(files: SyncFile[], order: string[]): SyncFile[] {
  const matchers = order.filter((g) => g).map(globMatcher)
  return files.toSorted(
    (a, b) =>
      matcherSortOrder(a.filename, matchers) -
      matcherSortOrder(b.filename, matchers)
  )
}

function matcherSortOrder(
  filename: string,
  matchers: ((input: string) => boolean)[]
): number {
  for (let i = 0; i < matchers.length; i++) {
    if (matchers[i](filename)) {
      return i
    }
  }
  return matchers.length
}
