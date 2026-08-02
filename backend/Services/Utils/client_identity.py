"""Coarse device and origin labels for the sessions list (M17).

Both labels answer one question — "was that me?" — so both are deliberately lossy.
The raw User-Agent is never persisted, and neither is the client's IP address: the
location is resolved from Cloudflare's request headers at write time and only the
resulting text is kept.
"""
import os
import re
from typing import Optional

from flask import request

from Services.Utils.country_names import country_name

# Matched in order — the first hit wins, so more specific tokens come first
# (Edge before Chrome, since Edge sends both; iPad/iPhone before Safari/Mac).
_BROWSERS = [
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("Chrome/", "Chrome"),
    ("Firefox/", "Firefox"),
    ("Safari/", "Safari"),
]

_PLATFORMS = [
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Windows", "Windows"),
    ("Mac OS X", "macOS"),
    ("Macintosh", "macOS"),
    ("CrOS", "ChromeOS"),
    ("Linux", "Linux"),
]

_LOCATION_PART = re.compile(r"^[\w\s.'\-()]{1,60}$", re.UNICODE)


def resolve_device_label(user_agent: Optional[str]) -> Optional[str]:
    """Coarse device description ("Chrome on macOS", "iPhone") from a User-Agent.

    Returns None for an absent or unrecognisable UA rather than inventing a label —
    "Unknown device" is a display decision, not a storage one.
    """
    if not user_agent:
        return None

    browser = next((name for token, name in _BROWSERS if token in user_agent), None)
    platform = next((name for token, name in _PLATFORMS if token in user_agent), None)

    # A phone or tablet is more recognisable by the device than by the browser on it,
    # which is how both Google's and Apple's device lists present the same information.
    if platform in ("iPhone", "iPad"):
        return platform
    if browser and platform:
        return f"{browser} on {platform}"
    return browser or platform


def resolve_location_label() -> Optional[str]:
    """Approximate origin ("Genoa, Liguria, Italy") from Cloudflare's location headers.

    Cloudflare injects these on requests routed through a proxied public hostname. They
    are trusted only when the app is actually configured to sit behind a proxy — a header
    a client can set itself must never become displayed fact. Unavailable or untrusted
    yields None, which the UI shows as "Unknown location".

    CF-IPLatitude/CF-IPLongitude are deliberately not read: they are city-centroid
    precision, so they add nothing this label does not already say, and coordinates on a
    per-session row are a tracking-grade datum with no product question behind it.
    """
    if int(os.environ.get("PROXY_TRUSTED_HOPS", "0")) <= 0:
        return None

    country_code = request.headers.get("CF-IPCountry")
    # Cloudflare has shipped this header under both names; read either.
    region = request.headers.get("CF-Region") or request.headers.get("CF-IPRegion")
    parts = [
        request.headers.get("CF-IPCity"),
        region,
        country_name(country_code) if country_code else None,
    ]

    label_parts: list[str] = []
    for part in parts:
        cleaned = (part or "").strip()
        if not cleaned or not _LOCATION_PART.match(cleaned):
            continue
        # City-states and single-region countries repeat themselves ("Singapore,
        # Singapore, Singapore"); keep the label readable.
        if any(cleaned.casefold() == seen.casefold() for seen in label_parts):
            continue
        label_parts.append(cleaned)

    # "XX" is Cloudflare's placeholder for a client it could not locate (and "T1" for Tor).
    if label_parts == ["XX"] or label_parts == ["T1"]:
        return None

    return ", ".join(label_parts) or None
