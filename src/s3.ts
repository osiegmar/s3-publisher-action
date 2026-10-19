import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client
} from '@aws-sdk/client-s3'
import * as mime from 'mime-types'
import fs from 'fs'
import * as core from '@actions/core'
import { performance } from 'perf_hooks'
import {
  RemoteFiles,
  SyncFile,
  CacheControl,
  PART_SIZE,
  globMatcher,
  dryRunPrefix,
  formatElapsed,
  formatSize
} from './types.js'
import { mapLimit } from 'async'
import { Upload } from '@aws-sdk/lib-storage'
import { debug } from './log.js'

// Max number of deletions logged individually (aggregate counts beyond this)
const MAX_LOGGED_DELETES = 1000

export class S3 {
  private readonly client: S3Client
  private readonly prefix: string
  private readonly bucket: string
  private readonly cacheControlMatchers: {
    headerValue: string
    match: (input: string) => boolean
  }[]
  private readonly dryRun: boolean
  private readonly dryPrefix: string

  constructor(
    bucket: string,
    prefix: string,
    cacheControl: CacheControl[],
    dryRun: boolean
  ) {
    this.client = new S3Client({})
    this.prefix = prefix
    this.bucket = bucket
    this.cacheControlMatchers = cacheControl.map((cc) => ({
      headerValue: cc.headerValue,
      match: globMatcher(cc.glob)
    }))
    this.dryRun = dryRun
    this.dryPrefix = dryRunPrefix(dryRun)
  }

  async listRemoteFiles(): Promise<RemoteFiles> {
    const start = performance.now()
    const files: RemoteFiles = {}

    let ContinuationToken = undefined
    let count = 0
    let page = 0
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
        const filename: string | undefined = this.prefix
          ? e.Key?.substring(this.prefix.length)
          : e.Key
        if (filename) {
          const etag = e.ETag ?? ''
          files[filename] = {
            size: e.Size ?? 0,
            etag: etag.replace(/^"|"$/g, '')
          }
          count++
        }
      }

      page++
      debug(`S3: Listed ${count} remote objects so far (page ${page})`)

      if (!response.IsTruncated) {
        break
      }

      ContinuationToken = response.NextContinuationToken
    }

    core.info(
      `S3: Listed ${count} remote objects in ${formatElapsed(performance.now() - start)}`
    )

    return files
  }

  // If one upload fails, in-flight uploads continue but no new ones start.
  // Partial uploads are possible before the error propagates.
  async uploadFiles(syncFiles: SyncFile[]): Promise<void> {
    await mapLimit(syncFiles, 5, async (syncFile: SyncFile) => {
      await this.uploadFile(syncFile)
    })
  }

  private async uploadFile(syncFile: SyncFile): Promise<void> {
    const destFile = this.prefix + syncFile.filename

    const contentType =
      mime.lookup(syncFile.filename) || 'application/octet-stream'
    const cacheControl = this.resolveCacheControl(syncFile.filename)

    const meta = `s3://${this.bucket}/${destFile} (size=${formatSize(syncFile.size)}; type=${contentType}; Cache-Control=${cacheControl ?? '(none)'})`

    if (this.dryRun) {
      core.info(`S3: ${this.dryPrefix}Uploading ${meta}`)
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

    upload.on('httpUploadProgress', (progress) => {
      if (
        progress.loaded &&
        progress.total &&
        progress.loaded < progress.total
      ) {
        const pct = Math.floor((progress.loaded / progress.total) * 100)
        debug(`S3: Uploaded ${pct} % of ${destFile}`)
      }
    })

    try {
      await upload.done()
      core.info(`S3: Uploaded ${meta}`)
    } catch (e) {
      core.error(`S3: Error uploading to ${destFile}: ${e}`)
      throw e
    }
  }

  resolveCacheControl(filename: string): string | undefined {
    for (const cc of this.cacheControlMatchers) {
      if (cc.match(filename)) {
        return cc.headerValue
      }
    }
    return undefined
  }

  async deleteFiles(remoteFiles: string[]): Promise<void> {
    // Listing every key would flood stdout on huge orphan sets (issue #124)
    const logKeys = remoteFiles.length <= MAX_LOGGED_DELETES

    if (this.dryRun) {
      if (logKeys) {
        for (const file of remoteFiles) {
          core.info(
            `S3: ${this.dryPrefix}Deleting s3://${this.bucket}/${this.prefix}${file}`
          )
        }
      } else {
        core.info(
          `S3: ${this.dryPrefix}Deleting ${remoteFiles.length} files` +
            ` from s3://${this.bucket}/${this.prefix}`
        )
      }
      return
    }

    const batchSize = 1000
    let deleted = 0
    for (let i = 0; i < remoteFiles.length; i += batchSize) {
      const batch = remoteFiles.slice(i, i + batchSize)
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((fn) => ({ Key: this.prefix + fn }))
          }
        })
      )

      deleted += response.Deleted?.length ?? 0
      if (logKeys) {
        for (const e of response.Deleted ?? []) {
          core.info(`S3: Deleted ${e.Key}`)
        }
      } else {
        core.info(`S3: Deleted ${deleted} of ${remoteFiles.length} files`)
      }

      if (response.Errors && response.Errors.length > 0) {
        const keys = response.Errors.map((e) => e.Key).join(', ')
        throw new Error(`Failed to delete objects: ${keys}`)
      }
    }
  }
}
