import crypto from 'crypto'
import fs from 'fs'

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
    private _checksum?: Buffer

    constructor(filename: string) {
        this._filename = filename
    }

    get filename(): string {
        return this._filename
    }

    get size(): number {
        return (this._size = this._size || fs.statSync(this._filename).size)
    }

    get checksum(): Buffer {
        return (this._checksum =
            this._checksum || crypto.createHash('md5').update(fs.readFileSync(this._filename)).digest())
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
