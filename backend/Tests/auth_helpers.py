"""Token helpers shared across test modules.

Kept out of conftest.py so test files can import it directly: conftest is imported by
pytest under its own module name, and importing it a second time by path would run the
whole module twice.
"""
from redis.exceptions import RedisError

from Models.user import User
from Services.session_service import SessionService
from Services.Middleware.auth_middleware import JWTService


def access_token_for(user: User, device_label: str = "pytest") -> str:
    """Mint an access token backed by a real Session row, exactly as login does.

    Every access token carries a `sid` (M17), so a test that needs one must own a
    session — minting a token without one would exercise a path the app rejects.
    """
    session = SessionService.start(user.id, device_label=device_label)
    return JWTService.generate_access_token(
        str(user.id), user.mail, user.admin, user.token_version, str(session.id)
    )


class FakeDenylist:
    """In-memory stand-in for the revocation Redis (M17).

    Instant revocation of an *access* token depends on the denylist, so any test asserting
    it needs one that is actually there. CI runs no Redis service and the service fails
    open by design, which would otherwise turn those assertions into silent no-ops that
    pass locally (Redis up) and fail in CI (Redis down) — or worse, the reverse.

    `failure` is settable because "unavailable" is not only RedisError: a malformed
    REVOCATION_REDIS_URL raises ValueError from the client constructor, a dead socket
    OSError.
    """

    def __init__(self) -> None:
        self.keys: dict[str, object] = {}
        self.down = False
        self.failure: Exception = RedisError("connection refused")

    def _guard(self) -> None:
        if self.down:
            raise self.failure

    def setex(self, key, ttl, value):
        self._guard()
        self.keys[key] = (ttl, value)

    def exists(self, key):
        self._guard()
        return 1 if key in self.keys else 0
