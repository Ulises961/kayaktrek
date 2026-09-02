"""Medical notes parked (2026-09-02) — the flag-off half of the feature's coverage.

Every other medical-notes test in this suite runs with `MEDICAL_NOTES_ENABLED` forced on
by `TestingConfig`, because parking a feature must not quietly stop testing it. This file
is the opposite case: with the flag off, the surface has to be genuinely closed, and it
has to be closed the way parking intends — a 404 that is indistinguishable from a route
that was never built, ahead of any auth or resource check.

See `Api/features.py` and `docs/adr/safety-privacy.md` "Parked (2026-09-02)".
"""
from unittest.mock import patch

import pytest

from Api.app import createApp
from Api.config import TestingConfig
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.user_resource import USER_ENDPOINT

# Any syntactically valid UUID. The gate fires before the resource is looked up, so a real
# id would prove less, not more — it could not distinguish "parked" from "not found".
DUMMY_ID = "01900000-0000-7000-8000-000000000001"

# (method, path) for every endpoint the gate covers. Kept as one list rather than a test
# per route so that adding a tenth medical endpoint without gating it fails here.
PARKED_ROUTES = [
    ("post", f"{USER_ENDPOINT}/me/medical-consent"),
    ("delete", f"{USER_ENDPOINT}/me/medical-consent"),
    ("get", f"{USER_ENDPOINT}/me/medical-notes"),
    ("get", f"{TRIP_ENDPOINT}/{DUMMY_ID}/member/me/medical-notes"),
    ("post", f"{TRIP_ENDPOINT}/{DUMMY_ID}/member/me/medical-consent"),
    ("delete", f"{TRIP_ENDPOINT}/{DUMMY_ID}/member/me/medical-consent"),
    ("post", f"{TRIP_ENDPOINT}/{DUMMY_ID}/member/me/share-medical-notes"),
    ("get", f"{TRIP_ENDPOINT}/{DUMMY_ID}/member/{DUMMY_ID}/medical-notes"),
    ("get", f"{TRIP_ENDPOINT}/{DUMMY_ID}/member/me/medical-notes/access-log"),
]


@pytest.fixture(scope="function")
def parked_app(app):
    """A second app instance built with the feature off, sharing the session app's schema.

    The flag has to be off *before* `createApp` runs, not flipped on `app.config`
    afterwards, because `setup_openapi()` walks the route table once at factory time —
    the spec assertion below would otherwise be testing a document built while the
    feature was still on. No DDL happens here; the schema already exists.
    """
    schema = app.config["SQLALCHEMY_ENGINE_OPTIONS"]["connect_args"]["options"]
    schema = schema.removeprefix("-csearch_path=").split(",")[0]

    with patch.object(TestingConfig, "MEDICAL_NOTES_ENABLED", False):
        parked = createApp("testing", schema=schema)

    assert parked.config["MEDICAL_NOTES_ENABLED"] is False
    return parked


@pytest.fixture(scope="function")
def parked_client(parked_app):
    return parked_app.test_client()


@pytest.mark.parametrize("method,path", PARKED_ROUTES)
def test_parked_routes_404_without_a_token(parked_client, method, path):
    """404, not 403. A 403 would confirm the route exists and invite a second look."""
    res = getattr(parked_client, method)(path)

    assert res.status_code == 404


@pytest.mark.parametrize("method,path", PARKED_ROUTES)
def test_parked_routes_404_for_an_authenticated_caller(parked_client, auth_headers, method, path):
    """The same 404 for a signed-in user.

    Worth asserting separately: a gate placed *below* the auth decorators would 401 the
    anonymous case and 404 only this one, which still tells an authenticated attacker the
    difference between a parked route and a missing one. Both cases must look identical.
    """
    res = getattr(parked_client, method)(path, headers=auth_headers)

    assert res.status_code == 404


def test_parked_routes_are_absent_from_the_published_contract(parked_client):
    spec = parked_client.get("/api/v1/openapi.json").get_json()

    assert not any("medical" in path for path in spec["paths"]), (
        "a parked endpoint is still described in the OpenAPI contract"
    )


def test_the_contract_is_otherwise_intact(parked_client):
    """Positive control — the gate must remove the medical paths and nothing else."""
    spec = parked_client.get("/api/v1/openapi.json").get_json()

    assert "/api/v1/trip/{id}" in spec["paths"]
    assert f"{USER_ENDPOINT}/me" in spec["paths"]


def test_keypair_endpoints_stay_open_while_the_feature_is_parked(parked_client, auth_headers):
    """Keypairs are deliberately kept (see the purge migration).

    Registration still generates one and a password change still re-wraps it, so that
    unparking is an environment variable rather than a migration plus a re-key prompt for
    every existing account. Gating this route by association would break the password
    change flow for a feature that is off.
    """
    res = parked_client.get(f"{USER_ENDPOINT}/me/keypair", headers=auth_headers)

    assert res.status_code != 404


def test_the_feature_is_on_in_the_rest_of_the_suite(app):
    """Guards the premise of every other medical-notes test file.

    If `TestingConfig` ever stops forcing the flag on, those files would start passing
    vacuously against 404s instead of exercising the parked code.
    """
    assert app.config["MEDICAL_NOTES_ENABLED"] is True
