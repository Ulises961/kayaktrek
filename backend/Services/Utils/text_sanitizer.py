import bleach


def sanitize_text(value: object) -> str:
    """Trim free text and strip any markup from it, keeping the author's ampersands.

    bleach returns HTML-safe text, so it rewrites "&" as "&amp;". The frontend escapes on
    render, which would show that entity as literal text, so it is decoded back. "<" and ">"
    stay encoded ("&lt;", "&gt;"): stored text never carries an angle bracket.
    """
    stripped = bleach.clean(str(value).strip(), tags=[], strip=True)
    return stripped.replace("&amp;", "&")
