import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import {minimatch} from 'minimatch'
import {S3} from './s3'
import {CacheControl, RemoteFile, RemoteFiles, SyncFile} from './types'

async function run(): Promise<void> {
    const bucket: string = core.getInput('bucket', {required: true})
    const prefix: string = core.getInput('prefix')
    const srcDir: string = core.getInput('dir', {required: true})
    const includes: string[] = core.getMultilineInput('includes', {required: true})
    const excludes: string[] = core.getMultilineInput('excludes')
    const order: string[] = core.getInput('order').split(',')
    const cacheControl: CacheControl[] = readCacheControlConfig(core.getMultilineInput('cache-control'))
    const force: boolean = core.getBooleanInput('force-upload', {
        required: true
    })
    const deleteOrphan: boolean = core.getBooleanInput('delete-orphaned', {
        required: true
    })
    const waitBeforeDelete = Number(core.getInput('wait-before-delete'))
    const dryRun: boolean = core.getBooleanInput('dry-run', {required: true})

    const client = new S3(bucket, prefix, cacheControl, dryRun)

    core.info(`Sync files from ${srcDir} (includes=${includes}, excludes=${excludes}, order=${order})`)

    try {
        // 1) List phase

        // list remote and local files
        const remoteFilesPromise: Promise<RemoteFiles> = client.listRemoteFiles()

        process.chdir(srcDir)
        const syncFiles: SyncFile[] = getAllFiles('.')
            .filter(globFilter(includes, excludes))
            .map(f => new SyncFile(f))

        const remoteFiles: RemoteFiles = await remoteFilesPromise
        const remoteFilenames: string[] = Object.keys(remoteFiles).filter(globFilter(includes, excludes))

        // 2) Check phase

        const newFiles: SyncFile[] = []
        const modifiedFiles: SyncFile[] = []
        const deletedFiles: string[] = []

        // Determine new and modified files
        for (const syncFile of syncFiles) {
            const localFilename = syncFile.filename
            if (!remoteFilenames.includes(localFilename)) {
                core.debug(`Add new file to list ${localFilename}`)
                newFiles.push(syncFile)
            } else if (force || isFileChange(syncFile, remoteFiles[localFilename])) {
                core.debug(`Add modified file to list ${localFilename}`)
                modifiedFiles.push(syncFile)
            }
        }

        // Determine orphaned files
        if (deleteOrphan) {
            for (const remoteFile of remoteFilenames) {
                if (!syncFiles.map(f => f.filename).includes(remoteFile)) {
                    core.debug(`Add orphaned file to list ${remoteFile}`)
                    deletedFiles.push(remoteFile)
                }
            }
        }

        // 3) Sync phase

        if (newFiles.length > 0) {
            core.info(`Upload ${newFiles.length} new files`)
            const sortedFiles = newFiles.sort(
                (p1: SyncFile, p2: SyncFile) => globPos(p1.filename, order) - globPos(p2.filename, order)
            )
            await client.uploadFiles(sortedFiles)
        }

        if (modifiedFiles.length > 0) {
            core.info(`Upload ${modifiedFiles.length} modified files (force=${force})`)
            const sortedFiles = modifiedFiles.sort(
                (p1: SyncFile, p2: SyncFile) => globPos(p1.filename, order) - globPos(p2.filename, order)
            )
            await client.uploadFiles(sortedFiles)
        }

        if (deletedFiles.length > 0) {
            if (!dryRun && waitBeforeDelete) {
                core.info(
                    `Wait ${waitBeforeDelete} milliseconds before deleting files (prevent failed access to stale references)`
                )
                await new Promise(r => setTimeout(r, waitBeforeDelete))
            }
            core.info(`Delete ${deletedFiles.length} orphaned files`)
            await client.deleteFiles(deletedFiles)
        }

        core.info(
            `Complete (${newFiles.length} added, ${modifiedFiles.length} updated, ${deletedFiles.length} deleted)`
        )
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message)
    }
}

function readCacheControlConfig(config: string[]): CacheControl[] {
    const ret: CacheControl[] = []

    if (config) {
        for (const line of config) {
            const idx = line.indexOf('=')
            ret.push(new CacheControl(line.substring(0, idx).trim(), line.substring(idx + 1).trim()))
        }
    }

    return ret
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath)

    for (const file of files) {
        const stats = fs.lstatSync(`${dirPath}/${file}`)
        if (stats.isDirectory()) {
            arrayOfFiles = getAllFiles(`${dirPath}/${file}`, arrayOfFiles)
        } else if (stats.isFile()) {
            arrayOfFiles.push(path.join(dirPath, '/', file))
        }
    }

    return arrayOfFiles
}

function globFilter(includes: string[], excludes: string[]): (p: string) => boolean {
    const options = {matchBase: true, dot: true}
    return (p: string) => {
        for (const exclude of excludes) {
            if (minimatch(p, exclude, options)) {
                core.debug(`File ${p} excluded by exclude glob ${exclude}`)
                return false
            }
        }
        for (const include of includes) {
            if (minimatch(p, include, options)) {
                core.debug(`File ${p} included by include glob ${include}`)
                return true
            }
        }

        core.debug(`File ${p} excluded (no glob matched)`)
        return false
    }
}

function globPos(filename: string, globs: string[]): number {
    for (let i = 0; i < globs.length; i++) {
        if (minimatch(filename, globs[i], {matchBase: true, dot: true})) {
            return i
        }
    }
    return globs.length
}

function isFileChange(syncFile: SyncFile, remoteFile: RemoteFile): boolean {
    return isFileSizeChange(syncFile, remoteFile) || isEtagChange(syncFile, remoteFile)
}

function isFileSizeChange(syncFile: SyncFile, remoteFile: RemoteFile): boolean {
    if (syncFile.size === remoteFile.size) {
        return false
    }
    core.debug(`File size change (${remoteFile.size} -> ${syncFile.size})`)
    return true
}

function isEtagChange(syncFile: SyncFile, remoteFile: RemoteFile): boolean {
    const localMd5: string = syncFile.checksum.toString('hex')
    const remoteMd5: string = remoteFile.etag.substring(1, remoteFile.etag.lastIndexOf('"'))
    if (remoteMd5 === localMd5) {
        return false
    }
    core.debug(`Etag changed ('${remoteMd5}' -> '${localMd5}')`)
    return true
}

run()
