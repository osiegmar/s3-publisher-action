import {DeleteObjectsCommand, ListObjectsV2Command, S3Client} from '@aws-sdk/client-s3'
import * as mime from 'mime-types'
import fs from 'fs'
import * as core from '@actions/core'
import {minimatch} from 'minimatch'
import {RemoteFiles, SyncFile, CacheControl, PART_SIZE} from './types'
import {mapLimit} from 'async'
import {Upload} from '@aws-sdk/lib-storage'

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

            if (response.$metadata.httpStatusCode !== 200) {
                throw new Error(`Failed to list objects in bucket ${this.bucket}:
                    S3 responded with status ${response.$metadata.httpStatusCode}`)
            }

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

            if (!response.IsTruncated) {
                break
            }

            ContinuationToken = response.NextContinuationToken
        }

        return files
    }

    async uploadFiles(syncFiles: SyncFile[]): Promise<void> {
        await mapLimit(syncFiles, 5, async (syncFile: SyncFile) => {
            await this.uploadFile(syncFile)
        })
    }

    private async uploadFile(syncFile: SyncFile): Promise<void> {
        const destFile = this.prefix + syncFile.filename

        const contentType = mime.lookup(syncFile.filename) || 'application/octet-stream'
        const cacheControl = this.resolveCacheControl(syncFile.filename)

        core.info(`Uploading s3://${this.bucket}/${destFile} (type=${contentType}; Cache-Control=${cacheControl})`)

        if (this.dryRun) {
            return
        }

        // Due to https://github.com/aws/aws-sdk-js-v3/issues/4321, we can't set the ContentMD5 header

        const upload = new Upload({
            client: this.client,
            partSize: PART_SIZE,
            queueSize: 2,
            params: {
                Bucket: this.bucket,
                Key: destFile,
                ContentLength: syncFile.size,
                // ContentMD5: syncFile.checksum,
                ContentType: contentType,
                CacheControl: cacheControl,
                Body: fs.createReadStream(syncFile.filename)
            }
        })

        upload.on('httpUploadProgress', progress => {
            if (progress.loaded && progress.total && progress.loaded < progress.total) {
                const pct = Math.floor((progress.loaded / progress.total) * 100)
                core.debug(`Uploaded ${pct} % of ${destFile}`)
            }
        })

        try {
            await upload.done()
            core.info(`Finished uploading ${destFile}`)
        } catch (e) {
            core.error(`Error uploading to ${destFile}: ${e}`)
        }
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
