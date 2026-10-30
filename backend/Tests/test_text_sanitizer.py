from pathlib import Path

import pytest

from Services.Utils.text_sanitizer import sanitize_text

BACKEND_ROOT = Path(__file__).resolve().parent.parent
HELPER_PATH = BACKEND_ROOT / "Services" / "Utils" / "text_sanitizer.py"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("P&H Cetus", "P&H Cetus"),
        ("  Tom & Jerry  ", "Tom & Jerry"),
        ("<b>Bold</b> and <a href='#'>linked</a>", "Bold and linked"),
        ("<script>alert('x')</script>Lovely", "alert('x')Lovely"),
        (42, "42"),
    ],
)
def test_strips_markup_trims_and_keeps_ampersands(raw, expected):
    assert sanitize_text(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "P&H Cetus",
        "Tom & Jerry <b>& co</b>",
        "5 < 6 and 7 > 3",
        "&lt;script&gt;alert(1)&lt;/script&gt;",
        "a &amp;lt; b",
    ],
)
def test_stored_value_survives_an_edit_round_trip(raw):
    stored = sanitize_text(raw)

    assert sanitize_text(stored) == stored


@pytest.mark.parametrize(
    "raw",
    [
        "<script>alert(1)</script>",
        "5 < 6 and 7 > 3",
        "&lt;script&gt;alert(1)&lt;/script&gt;",
        "&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;",
        "<img src=x onerror=alert(1)>",
    ],
)
def test_no_angle_bracket_survives(raw):
    cleaned = sanitize_text(raw)

    assert "<" not in cleaned and ">" not in cleaned


def test_nothing_calls_bleach_clean_except_the_helper():
    offenders = [
        str(path.relative_to(BACKEND_ROOT))
        for directory in ("Api", "Models", "Resources", "Schemas", "Services", "Tasks")
        for path in (BACKEND_ROOT / directory).rglob("*.py")
        if path != HELPER_PATH and "bleach.clean(" in path.read_text()
    ]

    assert offenders == []
