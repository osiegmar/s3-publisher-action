# S3 Publisher

Utility to publish files to a S3 bucket while maintaining file specific metadata.

A very basic configuration for publishing files from a `public` directory to a
bucket called `my-bucket-name`:

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: public
```

See [more examples](#examples).

## Authentication

This action requires
standard [AWS environment variables](https://docs.aws.amazon.com/sdkref/latest/guide/settings-reference.html#EVarSettings)
set.

Most common are `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

You can configure these environment variables either by using the
[aws-actions/configure-aws-credentials](https://github.com/marketplace/actions/configure-aws-credentials-action-for-github-actions)
action (which is recommended) or by setting them manually.

### Authentication via configure-aws-credentials-action

This example shows the use
of [aws-actions/configure-aws-credentials](https://github.com/marketplace/actions/configure-aws-credentials-action-for-github-actions)
in order to authenticate against AWS.

```yaml
on: [ push ]

jobs:
  build:

    runs-on: ubuntu-latest

    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::XXXXXXXXXXXX:role/github-actions
          aws-region: eu-central-1

      - uses: osiegmar/s3-publisher@v1
        with:
          bucket: my-bucket-name
          dir: ./public
```

### Manual authentication

You can also use
GitHubs [Encrypted secrets](https://docs.github.com/de/actions/security-guides/encrypted-secrets)
feature to configure authentication manually. **This is not recommended!**

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: ./public
  env:
    AWS_REGION: eu-central-1
    AWS_ACCESS_KEY_ID: ${{ secrets.access_key_id }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.secret_access_key }}
```

## Authorization

Regardless of the way you configure the authentication you need to configure
a policy for granting the necessary permissions.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::<bucketname>"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::<bucketname>/*"
        }
    ]
}
```

## Configuration

### Overview

| Property           | Description                                   | required | default |
|--------------------|-----------------------------------------------|----------|---------|
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

**bucket**: The AWS S3 bucket to publish files to. The bucket needs to exist already.
Read [how to create a bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/creating-bucket.html).

**dir**: The source directory where your files to publish resides in.

**includes**: The file globs to include. By default, all files (`**/*`) are included.
You can define multiple globs with this multiline input.
Files that are both included **and** excluded are effectively **excluded**.

**excludes**: The file globs to exclude. By default, no files are excluded.
You can define multiple globs with this multiline input.
Files that are both included **and** excluded are effectively **excluded**.

**order**: By default, files will be processed in arbitrary order. You can define multiple
globs (comma separated) to specify a specific order. Everything that does not match a glob
will be processed in the end.
Note that this action always groups files in *new* and *modified* files while *new* files
are always processed first.

**prefix**: A S3 path prefix can be configured optionally. A prefix `docs/` could be configured
for example in order to publish all files from the source directory into a 'docs-subdirectory' of
your S3 bucket.

**cache-control**: A Cache-Control header as defined
by [RFC 9111](https://datatracker.ietf.org/doc/rfc9111/).
Multiple globs and headers can be defined with this multiline input. The first matching glob will be
used.
If you change an already existing configuration, use `force-upload` to update existing files on S3.
By default, no Cache-Control header will be set.

**force-upload**: Force updating files regardless if their content has been changed. This can
be useful if you changed metadata (`cache-control`), as these data can't be used for the
size and hash based modification check.

**delete-orphaned**: As a security measure, no files will be deleted by default. Enable this
setting in order to delete files that exists on S3 but are removed from your local files.
You can use `dry-run` to see what would happen then.

**wait-before-delete**: Time in milliseconds to wait until deleting files from the bucket.
It can be beneficial to wait a few seconds before deleting orphaned files to let your users
complete ongoing site loads (e.g. old HTML versions are already loaded and these are referring to
some old CSS/JS files). By default, no wait will happen.

**dry-run**: Do not perform any real data modification. No files will be uploaded or deleted.

## Examples

**Sync all from `public` and delete orphaned files after waiting 3 seconds:**

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: public
    delete-orphaned: true
    wait-before-delete: 3000
```

**Sync everything but `.gitkeep` files:**

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: public
    excludes: '**/.gitkeep'
```

**Sync all files from the directories `public/assets` and `public/docs` but exclude `.zip`
and `.bak` files:**

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: public
    include: |
      assets/**/*
      docs/**/*
    excludes: |
      **/*.zip
      **/*.bak
```

**Sync all from `public` and set Cache-Control headers:**

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: public
    cache-control: |
      **/*.woff2 = public, max-age=604800, immutable
      **/*.html = no-cache
      **/* = public, max-age=60
```

**Sync all from `public` and start with `.css` files, then `.js` files, then everything else:**

```yaml
- uses: osiegmar/s3-publisher@v1
  with:
    bucket: my-bucket-name
    dir: public
    order: '**/*.css,**/*.js'
```
