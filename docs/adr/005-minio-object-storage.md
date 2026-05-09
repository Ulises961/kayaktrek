# ADR-005: MinIO for object storage (avatars, exports)

**Status**: accepted
**Date**: 2025-04-01

## Context

The application stores binary objects: user avatar images and GDPR data export archives. These should not be stored in the database (large blobs degrade query performance) or on the local filesystem (not portable across deploys).

S3-compatible object storage is the standard solution. Options considered:
- **AWS S3**: production-grade but adds a cloud dependency for local dev
- **MinIO**: self-hosted, S3-compatible, runs in Docker — zero cloud cost in dev, same API in production

## Decision

Use **MinIO** in development (Docker container) with the S3-compatible API (`boto3`). In production the same `StorageService` abstraction can point to AWS S3 or a managed MinIO instance by changing environment variables.

Bucket policy is set to **public-read** for the avatars bucket so image URLs can be served directly without signed URLs. A `minio-init` Docker Compose service applies the policy idempotently on startup.

## Consequences

**Positive**
- Zero cloud dependency in local development — fully self-contained `docker compose up`
- Same `boto3` code works against AWS S3 in production (just change `endpoint_url`)
- Public-read bucket means avatar URLs are stable, cacheable, and don't expire

**Negative / trade-offs**
- Public-read means any avatar URL is world-accessible without auth — acceptable for profile pictures, not for GDPR export archives (those should use signed URLs or a protected endpoint)
- MinIO in Docker adds ~200MB to the compose stack

**Risks / open questions**
- GDPR export files must NOT be in the public-read bucket — they need a private bucket with signed URLs or a download endpoint that verifies the requesting user's identity. This is not yet implemented.
- Production deployment: decide between self-hosted MinIO vs AWS S3 before M8
