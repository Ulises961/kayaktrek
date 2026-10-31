# Contributing

Kayaktrek is in maintenance mode: bug fixes and dependency updates, no new milestones. Issues are
welcome. A pull request is welcome too, but there is no promise of a quick review.

## Where things live

| Path        | What                                        |
| ----------- | ------------------------------------------- |
| `backend/`  | Flask REST API, PostgreSQL, Celery          |
| `frontend/` | Next.js web app                             |
| `mobile/`   | React Native (Expo) app                     |
| `e2e/`      | Playwright specs (run locally, not in CI)   |
| `docs/adr/` | Architecture decisions, one document per area |

Read the ADR for the area you are changing before you change it. Each one ends in a decision log
that records what was decided, when, and what it replaced.

## Running things

```bash
docker compose up -d                 # PostgreSQL, Redis, RabbitMQ and the other services

cd backend && .venv/bin/pytest       # parallel; add -n 0 to debug a failure
cd frontend && pnpm install && pnpm dev
cd mobile && pnpm install && pnpm run test:run
```

Stop the docker stack before the full backend suite, which creates its own schemas.

## Before you open a PR

- Typecheck, format and test the workspace you touched. `lefthook install` wires the pre-commit
  checks; `lefthook run local-verify` runs the test suites.
- Commit messages are `type(scope): subject`, enforced by the commit-msg hook.
- Migrations use Alembic directly (`alembic revision --autogenerate`), not `flask db migrate`, and
  should be additive so old and new code can run against the same schema for a moment.
- Never commit `.env` files. Each workspace has an `.env.example`.

## Licence

The code is AGPL-3.0. By opening a pull request you agree that your contribution is licensed the
same way. The name and mark "Kayaktrek" are reserved and are not part of that licence.

The milestone plans that guided development are not published. Their conclusions are in the ADR
decision logs.
