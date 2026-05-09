# ADR-001: JWT stored in httpOnly cookies, not localStorage

**Status**: accepted
**Date**: 2025-01-01

## Context

The web client needs to authenticate API requests. The two common approaches are storing JWT tokens in localStorage (accessible to JS) or in httpOnly cookies (invisible to JS, sent automatically by the browser).

The application handles personal expedition data and GDPR-sensitive profile information, so XSS resistance matters.

## Decision

Store the access token and refresh token in **httpOnly cookies** set by the Next.js server layer (server actions). Client-side JavaScript never touches the raw token values.

- Access token: 15-minute expiry, `sameSite: lax`, `secure` in production
- Refresh token: 30-day expiry, same flags
- Token refresh is handled by the Next.js middleware / API client before retrying a failed request — never by client-side JS directly

## Consequences

**Positive**
- XSS attacks cannot steal tokens — `document.cookie` cannot read httpOnly cookies
- CSRF risk is low with `sameSite: lax` and the fact that mutations go through server actions (not plain form POSTs to the API)
- Token refresh is transparent to UI components

**Negative / trade-offs**
- Slightly more complex server action layer: every mutation must go through Next.js, not directly to the Flask API from the browser
- CORS cannot be used as an auth mechanism for browser-to-Flask requests — all sensitive calls must be proxied through Next.js server actions

**Risks / open questions**
- Mobile (M9): React Native cannot use httpOnly cookies — will need a different storage strategy (SecureStore or equivalent)
