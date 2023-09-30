import {DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import * as mime from 'mime-types'
import fs from 'fs'
import * as core from '@actions/core'
import {minimatch} from 'minimatch'
import {RemoteFiles, SyncFile, CacheControl} from './types'
import async from 'async'

export class S3 {
    private client: S3Client
    private readonly prefix: string
    private readonly bucket: string
    private readonly cacheControl: CacheControl[]
    private readonly dryRun: boolean

    constructor(bucket: string, prefix: string, cacheControl: CacheControl[], dryRun: boolean) {
        this.client = new S3Client({})
        this.prefix = prefix
        this.bucket = bucket
        this.cacheControl = cacheControl
        this.dryRun = dryRun
    }

    async listRemoteFiles(): Promise<RemoteFiles> {
        const files: RemoteFiles = {}

        let ContinuationToken = undefined
        for (;;) {
            const command: ListObjectsV2Command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: this.prefix,
                ContinuationToken
            })
            const response = await this.client.send(command)

            for (const e of response.Contents ?? []) {
                const filename: string | undefined = this.prefix ? e.Key?.substring(this.prefix.length) : e.Key
                if (filename) {
                    files[filename] = {
                        filename,
                        size: e.Size ?? 0,
                        etag: e.ETag ?? ''
                    }
                }
            }

            if (response.IsTruncated) {
                ContinuationToken = response.NextContinuationToken
            } else {
                break
            }
        }

        return files
    }

    async uploadFiles(syncFiles: SyncFile[]): Promise<void> {
        const queue = async.queue((syncFile: SyncFile, callback) => {
            this.uploadFile(syncFile, callback)
        }, 10)

        await queue.push(syncFiles)
        await queue.drain()
    }

    private uploadFile(syncFile: SyncFile, callback: async.ErrorCallback<Error>): void {
        const destFile = this.prefix + syncFile.filename

        const contentType = mime.lookup(syncFile.filename) || 'application/octet-stream'
        const cacheControl = this.resolveCacheControl(syncFile.filename)

        core.info(`Uploading s3://${this.bucket}/${destFile} (type=${contentType}; Cache-Control=${cacheControl})`)

        if (this.dryRun) {
            return
        }

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: destFile,
            ContentLength: syncFile.size,
            ContentMD5: syncFile.checksum.toString('base64'),
            ContentType: contentType,
            CacheControl: cacheControl,
            Body: fs.createReadStream(syncFile.filename)
        })
        this.client.send(command, err => {
            if (err) {
                core.error(`Error uploading to ${destFile}`)
            } else {
                core.debug(`Uploaded ${destFile}`)
            }
            callback(err)
        })
    }

    resolveCacheControl(filename: string): string | undefined {
        for (const cc of this.cacheControl) {
            if (minimatch(filename, cc.glob, {matchBase: true, dot: true})) {
                return cc.headerValue
            }
        }
        return undefined
    }

    async deleteFiles(remoteFiles: string[]): Promise<void> {
        if (this.dryRun) {
            return
        }

        const response = await this.client.send(
            new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: {
                    Objects: remoteFiles.map(fn => ({Key: fn}))
                }
            })
        )

        for (const e of response.Deleted ?? []) {
            core.info(`Deleted ${e.Key}`)
        }
    }
}
