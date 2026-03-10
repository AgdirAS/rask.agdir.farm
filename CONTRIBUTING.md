# Contributing to Rask

Thank you for your interest in contributing to Rask — the modern RabbitMQ management dashboard!

## Prerequisites

- **Node.js** 20+
- **pnpm** 10+
- **Docker** (for running a local RabbitMQ instance)

## Local Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/agdir/rask.git
cd rask

# 2. Install dependencies
pnpm install

# 3. Start a local RabbitMQ instance
docker run -d --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:4-management

# 4. (Optional) Configure environment overrides
cp .env.example .env
# Edit .env if you need STORAGE_ENCRYPTION_KEY or other overrides

# 5. Start the dev server
pnpm dev
# Open http://localhost:35672
```

## Running Tests

```bash
# Unit tests
pnpm test

# Unit tests in watch mode
pnpm test:watch

# E2E tests (requires Docker Compose stack running)
docker compose -f docker-compose.test.yml up -d
pnpm build
pnpm test:e2e
docker compose -f docker-compose.test.yml down
```

## Code Conventions

- **Commits**: We use [Conventional Commits](https://www.conventionalcommits.org/). Format: `type(scope): description`
  - Examples: `feat(queues): add bulk delete`, `fix(bindings): correct vhost encoding`, `chore: update dependencies`
- **Scopes**: `queues`, `exchanges`, `bindings`, `publish`, `policies`, `admin`, `overview`, `settings`, `docker`, `ci`, etc.

## Pull Request Guidelines

1. **Open an issue first** for significant changes so the approach can be discussed before implementation.
2. Keep PRs focused — one feature or fix per PR.
3. All CI checks (lint, build, unit tests) must pass.
4. Match the existing code style — no reformatting unrelated lines.
5. Server components by default; `"use client"` only for interactive/polling pages.

## Architecture Notes

- `lib/rabbitmq.ts` is the single source of truth for all RabbitMQ API calls — add new broker operations there, not in API routes directly.
- API routes in `app/api/rabbitmq/` are thin proxies — they call `lib/rabbitmq.ts` functions and return `NextResponse.json()`.
- `amqplib` is **server-only** — never import it in client components or pages.
- TailwindCSS v4 with CSS-first config — no `tailwind.config.js`.

## Need Help?

- Open a [GitHub Issue](https://github.com/agdir/rask/issues)
- Check existing issues and PRs before opening a new one
