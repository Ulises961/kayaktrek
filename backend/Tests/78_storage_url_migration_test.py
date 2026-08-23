"""The URL-rebuild logic behind the MinIO → R2 storage migration.

`d4e8b03c1f27` rewrites `users.avatar_url` and `image.location` when object storage moves
host. It runs once, against live rows, and a mistake there orphans every avatar and route
photo in the database — so the pure part of it (recover the key, rebuild the URL) is worth
exercising directly rather than trusting on the day.

The migration is loaded by path because `alembic/versions/` is not an importable package.
"""
import importlib.util
from pathlib import Path

import pytest

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "d4e8b03c1f27_renormalise_stored_object_urls.py"
)


def _load():
    spec = importlib.util.spec_from_file_location("_url_migration", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migration = _load()

_MINIO = {"public": "http://localhost:9000/kayak", "private": "http://localhost:9000/kayak"}
_R2 = {"public": "https://cdn.kayaktrek.app", "private": "https://acct.r2.cloudflarestorage.com/kayak-private"}


class TestRebuild:
    def test_avatar_moves_to_the_public_cdn_base(self):
        old = "http://localhost:9000/kayak/avatars/abc-123.jpg"
        assert migration._rebuild(old, _R2) == "https://cdn.kayaktrek.app/avatars/abc-123.jpg"

    def test_public_point_image_moves_to_the_public_cdn_base(self):
        old = "http://localhost:9000/kayak/point-images/abc-123.jpg"
        assert migration._rebuild(old, _R2) == "https://cdn.kayaktrek.app/point-images/abc-123.jpg"

    def test_private_point_image_moves_to_the_private_base_not_the_cdn(self):
        """A private image rebuilt onto the public CDN base would be a data leak if that
        bucket is anonymously readable — the exact boundary the two-bucket split exists for."""
        old = "http://localhost:9000/kayak/point-images-private/abc-123.jpg"

        rebuilt = migration._rebuild(old, _R2)

        assert rebuilt == "https://acct.r2.cloudflarestorage.com/kayak-private/point-images-private/abc-123.jpg"
        assert "cdn.kayaktrek.app" not in rebuilt

    @pytest.mark.parametrize("reverse", [False, True])
    def test_private_prefix_is_not_mistaken_for_the_public_one(self, monkeypatch, reverse):
        """`point-images-private/` starts with `point-images`, so a substring match would
        route every private image into the public bucket.

        Asserted under both list orderings because ordering is *not* what protects this —
        the delimited `/point-images/` search is. Testing only the shipped order would pass
        whether or not the delimiter were there, which is no guard at all."""
        prefixes = list(migration._PREFIX_ROLES)
        monkeypatch.setattr(migration, "_PREFIX_ROLES", prefixes[::-1] if reverse else prefixes)
        old = "http://localhost:9000/kayak/point-images-private/abc-123.jpg"

        rebuilt = migration._rebuild(old, _R2)

        assert rebuilt.startswith(_R2["private"])
        assert "/point-images-private/" in rebuilt

    def test_the_object_key_survives_the_rebuild(self):
        """The key is the one part that must not change — it is what the object is stored
        under, so a corrupted key is an unrecoverable 404."""
        old = "http://localhost:9000/kayak/avatars/0198f2c1-7b3d-7e44-a0f1-3c9d2e8b7a55.png"

        assert migration._rebuild(old, _R2).endswith("/0198f2c1-7b3d-7e44-a0f1-3c9d2e8b7a55.png")

    def test_a_url_already_on_the_target_base_is_left_alone(self):
        """Returning None rather than an identical string is what makes the migration
        idempotent: a second run issues no UPDATE at all."""
        current = "https://cdn.kayaktrek.app/avatars/abc-123.jpg"

        assert migration._rebuild(current, _R2) is None

    @pytest.mark.parametrize(
        "url",
        [
            "https://booking.example.com/reservations/12345",  # travel_document.url shape
            "https://example.com/documents/permit.pdf",  # a prefix we do not own
            "",
        ],
    )
    def test_an_unrecognised_url_is_left_untouched(self, url):
        """Guessing at an unfamiliar shape is worse than skipping it — the row would be
        rewritten to point at storage that never held it."""
        assert migration._rebuild(url, _R2) is None

    def test_rollback_direction_works_the_same_way(self):
        """Downgrade is the same call with the environment pointed back at MinIO."""
        on_r2 = "https://cdn.kayaktrek.app/avatars/abc-123.jpg"

        assert migration._rebuild(on_r2, _MINIO) == "http://localhost:9000/kayak/avatars/abc-123.jpg"

    def test_a_round_trip_returns_the_original_url(self):
        original = "http://localhost:9000/kayak/point-images/abc-123.jpg"

        migrated = migration._rebuild(original, _R2)
        back = migration._rebuild(migrated, _MINIO)

        assert back == original


class TestBases:
    def test_unset_split_vars_keep_the_single_bucket_path_style_shape(self, monkeypatch):
        """Local dev and CI never set the split vars, and the migration must be a no-op
        there rather than rewriting every row to a subtly different string."""
        for var in ("STORAGE_BUCKET_PUBLIC", "STORAGE_BUCKET_PRIVATE", "STORAGE_PUBLIC_BASE_URL"):
            monkeypatch.delenv(var, raising=False)
        monkeypatch.setenv("STORAGE_BUCKET", "kayak")
        monkeypatch.setenv("STORAGE_PUBLIC_URL", "http://localhost:9000")

        bases = migration._bases()

        assert bases == {
            "public": "http://localhost:9000/kayak",
            "private": "http://localhost:9000/kayak",
        }

    def test_a_cdn_base_url_overrides_only_the_public_side(self, monkeypatch):
        monkeypatch.setenv("STORAGE_BUCKET_PUBLIC", "kayak-public")
        monkeypatch.setenv("STORAGE_BUCKET_PRIVATE", "kayak-private")
        monkeypatch.setenv("STORAGE_PUBLIC_BASE_URL", "https://cdn.kayaktrek.app")
        monkeypatch.setenv("STORAGE_PUBLIC_URL", "https://acct.r2.cloudflarestorage.com")

        bases = migration._bases()

        assert bases["public"] == "https://cdn.kayaktrek.app"
        assert bases["private"] == "https://acct.r2.cloudflarestorage.com/kayak-private"

    def test_a_trailing_slash_does_not_double_up(self, monkeypatch):
        monkeypatch.setenv("STORAGE_PUBLIC_BASE_URL", "https://cdn.kayaktrek.app/")
        monkeypatch.setenv("STORAGE_PUBLIC_URL", "https://acct.r2.cloudflarestorage.com/")
        monkeypatch.setenv("STORAGE_BUCKET_PRIVATE", "kayak-private")

        bases = migration._bases()

        assert bases["public"] == "https://cdn.kayaktrek.app"
        assert "//point-images" not in migration._rebuild(
            "http://old/kayak/point-images/x.jpg", bases
        )
