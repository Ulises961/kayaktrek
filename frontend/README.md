# Frontend

Next.js 16 web client for the Kayak Expedition Planner.

## Setup

```bash
pnpm install
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL
pnpm dev
```

## Structure

```
app/            Pages and layouts (App Router)
components/     UI primitives (ui/), app components (common/), icons
lib/dtos/       Zod schemas for every API type — source of truth for TypeScript types
hooks/          Custom React hooks
```

## Key pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — public map with shared itineraries |
| `/login` `/register` | Auth (not yet implemented) |
| `/dashboard` | Authenticated shell with sidebar |
| `/trips` | Trip list, grouped by state |
| `/trips/[id]` | Trip detail → days → itinerary on map |

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Leaflet + leaflet-velocity, Zod v4, Motion.

For developer conventions, routing rules, map integration notes, and current implementation status see [CLAUDE.md](CLAUDE.md).
