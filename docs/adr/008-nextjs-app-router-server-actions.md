# ADR-008: Next.js App Router with server actions for mutations

**Status**: accepted
**Date**: 2025-01-01

## Context

The web client needs a React framework. The choices were:
- **Next.js Pages Router**: stable, well-understood, but older pattern
- **Next.js App Router**: newer, server-component-first, React 18 concurrent features
- **Remix**: file-based routing with loaders/actions; strong form story
- **Vite + React SPA**: simplest, no server, but loses SSR and server-side auth

Auth is done via httpOnly cookies (ADR-001), which requires a server layer — a pure SPA cannot set or read httpOnly cookies. This rules out Vite SPA.

## Decision

Use **Next.js 16 App Router** with server components for data fetching and **server actions** for mutations.

- Route groups `(auth)/` and `(app)/` separate unauthenticated and authenticated layouts
- Server components fetch data directly; no client-side fetch waterfalls for initial page load
- Mutations use server actions (`"use server"`) — the token never leaves the server, no CORS issues
- Client components (`"use client"`) are used only where interactivity is required (forms, map canvas, drag-and-drop)

## Consequences

**Positive**
- httpOnly cookies work naturally — server actions run on the Next.js server, not in the browser
- No CORS configuration needed for authenticated mutations — requests go browser → Next.js server → Flask, not browser → Flask directly
- Server components eliminate client-side loading states for initial data
- Single deployment unit for the web frontend

**Negative / trade-offs**
- App Router is more complex than Pages Router — server vs client component boundary requires careful thought
- `useActionState` / `useTransition` pattern for progressive enhancement adds boilerplate compared to a plain `onSubmit` fetch
- Hydration mismatches are a known pain point — browser extensions (password managers) can inject DOM nodes that differ from SSR output; mitigated with `suppressHydrationWarning` on affected containers

**Risks / open questions**
- Any browser-to-Flask fetch that bypasses server actions will hit CORS — this is an architectural invariant that must be enforced in code review. All sensitive calls (auth, profile mutations, GDPR) must go through server actions.
