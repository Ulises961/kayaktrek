"""renormalise stored object URLs against the configured storage base

`StorageService.upload()` returns an absolute URL and the DB stores it, so moving object
storage from MinIO to Cloudflare R2 changes the host — and the bucket segment disappears
entirely, because an R2 custom domain maps to a bucket at its own root while MinIO is
path-style (`host/bucket/key`). Every row holding one of those URLs would otherwise point
at a host that no longer serves it.

Only two columns are affected, confirmed by tracing every caller of `StorageService.upload()`
and `move()`:

  - `users.avatar_url`   — absolute URL (`avatars/` prefix)
  - `image.location`     — absolute URL (`point-images/` or `point-images-private/`)

Deliberately NOT touched:

  - `travel_document.attachment_path` stores the raw object key, not a URL, so it is
    already host-independent and needs no migration.
  - `travel_document.url` is a user-entered external link (a booking or permit page).
    Rewriting it would corrupt real user data — it only looks similar.

**The operation is "rebuild every stored URL against whatever storage the environment
currently points at",** which is why `upgrade()` and `downgrade()` do the same thing. To
roll back, point the STORAGE_* vars at MinIO again and run the down leg; it renormalises
to that base exactly as the up leg renormalised to R2. This is also what makes it
idempotent — running it twice in a row is a no-op.

Rebuilding, not string-replacing: each URL is split on its known prefix to recover the
object key, then reassembled. The prefix is the one part of the URL that does not change,
so nothing here needs to know what the *old* base was. A row whose URL contains no known
prefix is left untouched rather than guessed at.

Revision ID: d4e8b03c1f27
Revises: c3f7a91b02de
Create Date: 2026-08-23

"""
import logging
import os

import sqlalchemy as sa
from alembic import op

revision = 'd4e8b03c1f27'
down_revision = 'c3f7a91b02de'
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

# Mirrors Services/storage_service.py's _KIND_PREFIXES and _KIND_ROLES. Duplicated on
# purpose: a migration that imports application code stops being runnable the moment that
# code is refactored, and this one has to keep working for as long as the revision exists.
#
# Order is not load-bearing, though it looks like it should be: `point-images-private/`
# starts with `point-images`, but the search is for the delimited `/point-images/`, which
# cannot match `/point-images-private/`. Listed most-specific-first anyway, so that adding
# a genuinely ambiguous prefix later does the right thing by default.
_PREFIX_ROLES = [
    ("point-images-private/", "private"),
    ("point-images/", "public"),
    ("avatars/", "public"),
]


def _bases() -> dict[str, str]:
    """Public and private URL bases, derived exactly as StorageService derives them."""
    bucket = os.environ.get("STORAGE_BUCKET", "kayak")
    public_bucket = os.environ.get("STORAGE_BUCKET_PUBLIC", bucket)
    private_bucket = os.environ.get("STORAGE_BUCKET_PRIVATE", bucket)
    public_url = os.environ.get("STORAGE_PUBLIC_URL", "http://localhost:9000").rstrip("/")
    public_base = os.environ.get("STORAGE_PUBLIC_BASE_URL", "").rstrip("/")

    return {
        "public": public_base or f"{public_url}/{public_bucket}",
        "private": f"{public_url}/{private_bucket}",
    }


def _rebuild(url: str, bases: dict[str, str]) -> str | None:
    """Return the renormalised URL, or None if it is already correct or unrecognised."""
    for prefix, role in _PREFIX_ROLES:
        marker = f"/{prefix}"
        if marker not in url:
            continue
        object_key = url.split(marker)[-1]
        rebuilt = f"{bases[role]}/{prefix}{object_key}"
        return rebuilt if rebuilt != url else None
    return None


def _renormalise() -> None:
    connection = op.get_bind()
    bases = _bases()
    logger.info("Renormalising stored object URLs against %s", bases)

    for table, column in (("users", "avatar_url"), ("image", "location")):
        rows = connection.execute(
            sa.text(
                f"SELECT id, {column} FROM {table} "  # noqa: S608 - identifiers are literals above
                f"WHERE {column} IS NOT NULL AND {column} <> ''"
            )
        ).all()

        updated = 0
        for row_id, url in rows:
            rebuilt = _rebuild(url, bases)
            if rebuilt is None:
                continue
            connection.execute(
                sa.text(f"UPDATE {table} SET {column} = :url WHERE id = :id"),  # noqa: S608
                {"url": rebuilt, "id": row_id},
            )
            updated += 1

        logger.info("  %s.%s: %d of %d rows rewritten", table, column, updated, len(rows))


def upgrade():
    _renormalise()


def downgrade():
    # Same operation: point STORAGE_* back at MinIO first, then run this. See the module
    # docstring — the migration renormalises to the configured base in either direction.
    _renormalise()
