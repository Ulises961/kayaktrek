import uuid

import pytest

from Models.user import User


@pytest.fixture
def invite_gate_enabled(app):
    """Turn on the closed-beta invite gate for the duration of a test.

    TestingConfig leaves INVITE_CODE empty (gate disabled) so every other registration
    test is unaffected — this fixture is opt-in per test.
    """
    app.config["INVITE_CODE"] = "beta-code-2026"
    yield "beta-code-2026"
    app.config["INVITE_CODE"] = ""


def _payload(**overrides):
    data = {
        "username": f"invited_{uuid.uuid4().hex[:8]}",
        "mail": f"invited_{uuid.uuid4().hex[:8]}@example.com",
        "pwd": "SecurePass123!",
        "name": "Invited",
        "surname": "Paddler",
    }
    data.update(overrides)
    return data


class TestInviteGateDisabled:

    def test_register_succeeds_with_no_invite_code_when_gate_is_off(self, client):
        """TestingConfig's default (empty INVITE_CODE) — the common case for every other test."""
        response = client.post("/api/v1/auth/register", json=_payload())
        assert response.status_code == 201

    def test_registration_status_reports_not_required(self, client):
        response = client.get("/api/v1/auth/registration-status")
        assert response.status_code == 200
        assert response.get_json() == {"inviteCodeRequired": False}


class TestRegistrationStatus:

    def test_reports_required_once_the_kill_switch_is_armed(self, client, invite_gate_enabled):
        """
        The register form (M25 §3) reads this to decide whether to show its invite-code
        field, without a frontend rebuild — the whole point of the kill switch.
        """
        response = client.get("/api/v1/auth/registration-status")
        assert response.status_code == 200
        assert response.get_json() == {"inviteCodeRequired": True}

    def test_is_public_and_unaffected_by_the_default_rate_limit_at_normal_volume(self, client):
        """No auth header, no 403/401 — this must be readable before a visitor has an account."""
        response = client.get("/api/v1/auth/registration-status")
        assert response.status_code == 200


class TestInviteGateEnabled:

    def test_register_rejects_missing_invite_code(self, client, invite_gate_enabled):
        payload = _payload()
        response = client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 403
        data = response.get_json()
        assert data["code"] == "invalid_invite_code"
        assert User.query.filter_by(mail=payload["mail"]).first() is None

    def test_register_rejects_wrong_invite_code(self, client, invite_gate_enabled):
        payload = _payload(inviteCode="not-the-code")
        response = client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 403
        assert User.query.filter_by(mail=payload["mail"]).first() is None

    def test_register_succeeds_with_correct_invite_code(self, client, invite_gate_enabled):
        payload = _payload(inviteCode=invite_gate_enabled)
        response = client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 201
        assert User.query.filter_by(mail=payload["mail"]).first() is not None
