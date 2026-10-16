"""Coarse device and origin labels for the sessions list.

Both labels answer one question — "was that me?" — so both are deliberately lossy.
The raw User-Agent is never persisted, and neither is the client's IP address: the
location is resolved from Cloudflare's request headers at write time and only the
resulting text is kept.
"""
import hmac
import os
import re
from typing import Optional

from flask import request

from Services.Utils.country_names import country_name

# The web client reaches us through a Next server action, so the request's own User-Agent
# is Node's and its address is the server's. Next forwards the browser's values under these
# names — not under Cloudflare's own, which Cloudflare would overwrite if that hop is
# proxied — and proves they came from our frontend with a shared secret. Without that proof
# they are ignored entirely: a header any caller can set must not let a stolen session
# choose how it appears in the list that exists to spot exactly that.
_FORWARDED_PROOF = "X-Client-Forwarded"
_FORWARDED_USER_AGENT = "X-Client-User-Agent"
_FORWARDED_CITY = "X-Client-City"
_FORWARDED_REGION = "X-Client-Region"
_FORWARDED_COUNTRY = "X-Client-Country"

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

# Our own clients identify themselves rather than being guessed at: React Native's default
# User-Agent (okhttp/…) matches no token above.
_APP_USER_AGENT = re.compile(r"^Kayaktrek/\S+(?:\s+\((?P<detail>[^)]*)\))?")


def _forwarding_is_proven() -> bool:
    """Whether this request carries our frontend's shared secret.

    Unset means the deployment does not forward — never "trust whatever arrives". Compared
    with `compare_digest` so a wrong guess costs the same time as any other.
    """
    secret = os.environ.get("CLIENT_FORWARDING_SECRET", "")
    if not secret:
        return False
    return hmac.compare_digest(request.headers.get(_FORWARDED_PROOF, ""), secret)


def _app_device_label(user_agent: str) -> Optional[str]:
    """"Kayaktrek app on Pixel 8" from our own clients' User-Agent, or None if not ours.

    The detail is whatever the client chose to send: Android supplies a model, iOS only an
    OS version (Apple gives no model string), and either may be absent.
    """
    match = _APP_USER_AGENT.match(user_agent)
    if not match:
        return None

    detail = (match.group("detail") or "").strip()
    if not detail:
        return "Kayaktrek app"
    # "Android 14; Pixel 8" — the model is the recognisable half, so it wins when present.
    parts = [part.strip() for part in detail.split(";") if part.strip()]
    if len(parts) > 1:
        return f"Kayaktrek app on {parts[-1]}"
    # "Android 14" / "iOS 18.0" — drop the version, which says nothing about which device.
    return f"Kayaktrek app on {parts[0].split()[0]}"


def resolve_device_label(user_agent: Optional[str]) -> Optional[str]:
    """Coarse device description ("Chrome on macOS", "iPhone") from a User-Agent.

    Returns None for an absent or unrecognisable UA rather than inventing a label —
    "Unknown device" is a display decision, not a storage one.
    """
    # The browser's own UA, when our frontend forwarded it on the caller's behalf. The
    # request's own is Node's in that case, and describes nobody's device.
    if _forwarding_is_proven():
        user_agent = request.headers.get(_FORWARDED_USER_AGENT) or user_agent

    if not user_agent:
        return None

    app_label = _app_device_label(user_agent)
    if app_label:
        return app_label

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
    # Our frontend's forwarded copy wins, and does not need the trusted-hops gate: that gate
    # exists because Cloudflare's headers are client-spoofable, and these already proved
    # themselves with the shared secret. It also has to stand on its own, since the Next
    # server's own origin is not the paddler's and would label every session with the
    # datacentre it passed through.
    if _forwarding_is_proven():
        country_code = request.headers.get(_FORWARDED_COUNTRY)
        parts = [
            request.headers.get(_FORWARDED_CITY),
            request.headers.get(_FORWARDED_REGION),
            country_name(country_code) if country_code else None,
        ]
        return _join_location(parts)

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
    return _join_location(parts)


def _join_location(parts: list[Optional[str]]) -> Optional[str]:
    """City, region and country into one readable label, or None if nothing usable."""

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
