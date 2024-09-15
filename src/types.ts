import fs from 'fs'
import {generateETag} from 's3-etag'

// While 5 MB is the minimum part size for a multipart upload,
// the current default part size used by AWS is 16 MB.
export const PART_SIZE = 16 * 1024 * 1024

export type RemoteFile = {
    filename: string
    size: number
    etag: string
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
        return (this._size = this._size || fs.statSync(this._filename).size)
    }

    get checksum(): string {
        return (this._checksum = this._checksum || generateETag(this._filename, PART_SIZE))
    }
}

export class CacheControl {
    private readonly _glob: string
    private readonly _headerValue: string

    constructor(glob: string, headerValue: string) {
        this._glob = glob
        this._headerValue = headerValue
    }

    get glob(): string {
        return this._glob
    }

    get headerValue(): string {
        return this._headerValue
    }
}
