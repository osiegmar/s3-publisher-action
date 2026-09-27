# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Nothing yet

## [3.0.1] - 2026-09-27

### Fixed

- Prevent flooding stdout on buckets with huge numbers of objects, which could
  crash the action with `write EINVAL` (#124). Debug output is only written when
  debug logging is enabled, per-file logging while filtering/diffing the remote
  object set was removed, and delete logging is aggregated above 1000 files.

### Security

- Updated `@actions/core` dependencies, bundling `undici` 6.29.0 to fix multiple
  vulnerabilities (HTTP request smuggling, CRLF/header injection, WebSocket
  denial of service).
- Updated `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` to 3.1141.0, which no
  longer depend on the vulnerable `fast-xml-parser`.

### Changed

- Updated all development dependencies to their latest versions, including
  TypeScript 6.
- Updated GitHub Actions used in workflows to their latest major versions.

## [3.0.0] - 2026-06-10

### Changed

- **BREAKING**: Upgraded `mime-types` to v3, which aligns the resolved
  Content-Type of some file extensions with current standards. Most notably,
  `.js`/`.mjs` files now resolve to `text/javascript` (previously
  `application/javascript`). Files re-published after upgrading will have their
  Content-Type metadata updated accordingly.
- Updated all other dependencies (including `@types/node` to v24 and `globals`
  to v17)
- Clarify in the docs that the `s3:DeleteObject` permission is only required
  when using `delete-orphaned`

## [2.0.1] - 2026-03-07

### Fixed

- Log the reason for re-uploading a modified file at debug level instead of info
  level to reduce log noise

## [2.0.0] - 2026-02-28

### Changed

- **BREAKING**: Upgraded GitHub Actions runtime from Node 20 to Node 24
- Migrated to ESM (`"type": "module"`) targeting Node 24
- Replaced ncc with Rollup for bundling
- Replaced minimatch with picomatch for glob matching
- Switched ESLint to flat config
- Moved tests to `__tests__/` with Jest 30 and ESM support
- Updated all dependencies

### Fixed

- Fix `deleteFiles` not prepending S3 key prefix (orphan deletion broken with
  prefix)
- Fix upload errors being swallowed instead of propagated
- Fix `SyncFile.size` not caching for 0-byte files
- Fix `readCacheControlConfig` silently accepting lines without `=`
- Fix `deleteFiles` exceeding AWS 1000-object limit (now batches)
- Fix `deleteFiles` ignoring partial delete failures
- Fix non-Error exceptions being silently dropped in `run()`

### Added

- CI workflows for linting, dist check, and CodeQL analysis
- Release script

## [1.1.1] - 2025-09-05

- Updated dependencies

## [1.1.0] - 2024-09-15

### Added

- Multipart upload support for S3 #78

## 1.0.0 - 2024-08-20

- Initial release

[Unreleased]:
  https://github.com/osiegmar/s3-publisher-action/compare/v3.0.1...main
[3.0.1]: https://github.com/osiegmar/s3-publisher-action/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/osiegmar/s3-publisher-action/compare/v2.0.1...v3.0.0
[2.0.1]: https://github.com/osiegmar/s3-publisher-action/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/osiegmar/s3-publisher-action/compare/v1.1.1...v2.0.0
[1.1.1]: https://github.com/osiegmar/s3-publisher-action/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/osiegmar/s3-publisher-action/compare/v1.0.0...v1.1.0
