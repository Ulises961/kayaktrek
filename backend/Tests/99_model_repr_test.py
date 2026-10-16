"""A model's repr ends up in tracebacks and log lines, so it must not carry secrets."""
from Models.user import User


def test_a_users_repr_does_not_carry_the_password_hash():
    user = User(pwd="Sup3rSecret!", mail="paddler@example.com", name="Paddler", username="paddler")

    assert user.pwd and user.pwd != "Sup3rSecret!"
    assert user.pwd not in repr(user)
    assert "paddler@example.com" in repr(user)
