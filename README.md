# S3 Publisher

![Linter](https://github.com/osiegmar/s3-publisher-action/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/osiegmar/s3-publisher-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/osiegmar/s3-publisher-action/actions/workflows/check-dist.yml/badge.svg)
![CodeQL](https://github.com/osiegmar/s3-publisher-action/actions/workflows/codeql-analysis.yml/badge.svg)
![Coverage](./badges/coverage.svg)

Utility to publish files to a S3 bucket while maintaining file specific
metadata.

## Why this action?

When deploying a static site to S3, getting cache behavior right matters. Most
S3 sync tools treat all files equally — they upload everything with the same (or
no) `Cache-Control` header and don't consider file ordering. This often leads to
a common workaround: running a CloudFront invalidation after every deployment.
But CloudFront invalidation only clears the CDN cache — it cannot clear the
browser cache of your users.

A better approach starts with how modern sites are structured. Static site
generators and build tools typically produce two kinds of files:

- **Assets** (CSS, JS, images, fonts) with content hashes in their filenames,
  like `style.a1b2c3.css`. These files never change — when the content changes,
  the filename changes. They can safely be cached for a very long time with the
  `immutable` directive.
- **HTML files** that reference these assets. They should be cached for only a
  short time (or not at all) so that visitors always get the latest version,
  which in turn references the correct asset filenames.

This action is built around that idea. The `cache-control` option lets you
assign different headers per glob pattern, and the `order` option controls which
files are uploaded first. By uploading assets before HTML files, visitors never
see references to files that haven't been uploaded yet.

With this setup, CloudFront invalidation becomes unnecessary — HTML files expire
from the cache within minutes, and hashed assets are immutable by design. For
more background on effective caching strategies, see
[Caching Header Best Practices](https://simonhearne.com/2022/caching-header-best-practices/).

While this action is optimized for static site publishing, it works for any S3
upload scenario where file-specific metadata and upload ordering matter.

## Quick start

A very basic configuration for publishing files from a `public` directory to a
bucket called `my-bucket-name`:

```yaml
- uses: osiegmar/s3-publisher-action@v3
  with:
    bucket: my-bucket-name
    dir: public
```

See [more examples](#examples).

## Authentication

This action requires standard
[AWS environment variables](https://docs.aws.amazon.com/sdkref/latest/guide/settings-reference.html#EVarSettings)
set.

Most common are `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

You can configure these environment variables either by using the
[aws-actions/configure-aws-credentials](https://github.com/marketplace/actions/configure-aws-credentials-action-for-github-actions)
action (which is recommended) or by setting them manually.

### Authentication via configure-aws-credentials-action

This example shows the use of
[aws-actions/configure-aws-credentials](https://github.com/marketplace/actions/configure-aws-credentials-action-for-github-actions)
in order to authenticate against AWS.

```yaml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest

    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v6

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::XXXXXXXXXXXX:role/github-actions
          aws-region: eu-central-1

      - uses: osiegmar/s3-publisher-action@v3
        with:
          bucket: my-bucket-name
          dir: ./public
```

### Manual authentication

You can also use GitHubs
[Encrypted secrets](https://docs.github.com/de/actions/security-guides/encrypted-secrets)
feature to configure authentication manually. **This is not recommended!**

```yaml
- uses: osiegmar/s3-publisher-action@v3
  with:
    bucket: my-bucket-name
    dir: ./public
  env:
    AWS_REGION: eu-central-1
    AWS_ACCESS_KEY_ID: ${{ secrets.access_key_id }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.secret_access_key }}
```

## Authorization

Regardless of the way you configure the authentication you need to configure a
policy for granting the necessary permissions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<bucketname>"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::<bucketname>/*"
    }
  ]
}
```

> The `s3:DeleteObject` permission is only required when the `delete-orphaned`
> option is enabled.

## Configuration

### Overview

| Property           | Description                                   | required | default |
| ------------------ | --------------------------------------------- | -------- | ------- |
| bucket             | Destination S3 bucket to publish to           | true     |         |
| dir                | Source directory read files from              | true     |         |
| includes           | File globs to include                         | true     | \*\*/\* |
| excludes           | File globs to exclude                         | false    |         |
| order              | File processing order globs                   | false    |         |
| prefix             | S3 path prefix                                | false    |         |
| cache-control      | Cache-Control configuration                   | false    |         |
| force-upload       | Force publish (skip modification check)       | false    | false   |
| delete-orphaned    | Delete remote files that do not exist locally | false    | false   |
| wait-before-delete | Milliseconds to wait before deleting files    | false    |         |
| dry-run            | Disable real changes                          | false    | false   |

### Details

**bucket**: The AWS S3 bucket to publish files to. The bucket needs to exist
already. Read
[how to create a bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/creating-bucket.html).

**dir**: The source directory where your files to publish resides in.

All globs (`includes`, `excludes`, `order`, `cache-control`) are matched against
the file path relative to `dir`. Globs without a slash (e.g. `*.html`) match
files in any directory; globs with a slash (e.g. `assets/**`) match the full
relative path.

**includes**: The file globs to include. By default, all files (`**/*`) are
included. You can define multiple globs with this multiline input. Files that
are both included **and** excluded are effectively **excluded**.

**excludes**: The file globs to exclude. By default, no files are excluded. You
can define multiple globs with this multiline input. Files that are both
included **and** excluded are effectively **excluded**.

**order**: By default, files will be processed in arbitrary order. You can
define multiple globs (comma separated) to specify a specific order. Everything
that does not match a glob will be processed in the end. Note that this action
always groups files in _new_ and _modified_ files while _new_ files are always
processed first.

**prefix**: A S3 path prefix can be configured optionally. A prefix `docs/`
could be configured for example in order to publish all files from the source
directory into a 'docs-subdirectory' of your S3 bucket.

**cache-control**: A Cache-Control header as defined by
[RFC 9111](https://datatracker.ietf.org/doc/rfc9111/). Multiple globs and
headers can be defined with this multiline input. The first matching glob will
be used. If you change an already existing configuration, use `force-upload` to
update existing files on S3. By default, no Cache-Control header will be set.

**force-upload**: Force updating files regardless if their content has been
changed. This can be useful if you changed metadata (`cache-control`), as these
data can't be used for the size and hash based modification check.

**delete-orphaned**: As a security measure, no files will be deleted by default.
Enable this setting in order to delete files that exists on S3 but are removed
from your local files. You can use `dry-run` to see what would happen then.

**wait-before-delete**: Time in milliseconds to wait until deleting files from
the bucket. It can be beneficial to wait a few seconds before deleting orphaned
files to let your users complete ongoing site loads (e.g. old HTML versions are
already loaded and these are referring to some old CSS/JS files). By default, no
wait will happen.

**dry-run**: Do not perform any real data modification. No files will be
uploaded or deleted.

## Examples

**Include specific directories and exclude certain file types:**

```yaml
- uses: osiegmar/s3-publisher-action@v3
  with:
    bucket: my-bucket-name
    dir: public
    includes: |
      assets/**/*
      docs/**/*
    excludes: |
      **/*.zip
      **/*.bak
```

**Full static site deployment — upload hashed assets first with long-lived cache
headers, use short cache times for HTML, and clean up orphaned files:**

```yaml
- uses: osiegmar/s3-publisher-action@v3
  with:
    bucket: my-bucket-name
    dir: public
    delete-orphaned: true
    wait-before-delete: 3000
    order: 'assets/**/*'
    cache-control: |
      assets/**/* = public, max-age=31536000, immutable
      **/*.html = public, max-age=300
      **/* = public, max-age=3600
```

This example reflects the approach described in
[Why this action?](#why-this-action). Hashed assets are uploaded first and
cached for one year with the `immutable` directive. HTML files are cached for
only 5 minutes, so visitors quickly see the latest version pointing to the
correct asset filenames. Everything else gets a moderate cache time. Orphaned
files are cleaned up after a short delay to avoid breaking in-flight page loads.
With this setup, no CloudFront invalidation is needed.
