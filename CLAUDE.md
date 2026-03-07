# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Rask** is an open source RabbitMQ management dashboard by [Agdir Drift AS](https://agdir.no) — a farming-as-a-service company. Named after Ratatoskr (the Norse messenger squirrel), it was built because the native RabbitMQ management UI is outdated. Rask extends it with a modern UI and additional features beyond what RabbitMQ ships with.

It proxies all RabbitMQ Management HTTP API calls through Next.js API routes — the browser never talks to RabbitMQ directly.

**Upcoming features:** Azure AD SSO (primary identity provider for Agdir), and further UI/UX improvements beyond the native RabbitMQ dashboard.

## Commands

```bash
pnpm dev      # Start dev server at http://localhost:35672
pnpm build    # Production build
pnpm lint     # ESLint check
```

No test suite is configured.

## Architecture

**Request flow:**
```
Browser → Next.js API Routes (/api/rabbitmq/*) → RabbitMQ Management API (port 15672)
                                               → RabbitMQ AMQP (port 5672, server-only via amqplib)
```

**Rendering pattern:** Server Components by default. Only data-polling components use `"use client"` with TanStack Query (staleTime: 5s, retry: 1). Layout, sidebar, and header are static Server Components.

**Multi-env system:** Symlink-based `.env.local` switcher (`/api/envs/[slug]/activate`) with a full-screen `EnvGateway` overlay when no environment is active. Session-cached to avoid repeated env reads.

## Key Files

- `lib/rabbitmq.ts` — All RabbitMQ Management API calls and amqplib operations (peek, publish, purge). The single source of truth for broker interaction.
- `lib/types.ts` — TypeScript types for all RabbitMQ entities (Queue, Exchange, Connection, Binding, etc.)
- `lib/env.ts` — Server-only helpers for reading/writing `.env.local` files
- `components/env-gateway.tsx` — Full-screen overlay for multi-env management
- `components/providers.tsx` — QueryClientProvider + ThemeProvider setup
- `app/(app)/layout.tsx` — App shell with sidebar + header

## API Routes

All RabbitMQ proxy routes live under `app/api/rabbitmq/`. Pattern: proxy to `http://{host}:{port}/api/{path}` with Basic Auth headers from current env config.

Settings and env management: `app/api/settings/` and `app/api/envs/`.

## Conventions

- **GIT Conventional Commits**: `feat:`, `fix:`, `chore:` with scope in parens, e.g. `feat(queues): add purge action`
- **shadcn/ui** components in `components/ui/` (new-york style, slate base, Lucide icons)
- **TailwindCSS v4** — CSS-first config (no `tailwind.config.js`; config is in CSS)
- Path alias `@/*` maps to the repo root
- `amqplib` is **server-only** — never import it in client components

## Environment Variables

All optional; defaults work with a local RabbitMQ instance:
- `RABBITMQ_HOST` (default: `localhost`)
- `RABBITMQ_MANAGEMENT_PORT` (default: `15672`)
- `RABBITMQ_AMQP_PORT` (default: `5672`)
- `RABBITMQ_USER` / `RABBITMQ_PASSWORD` (default: `guest`/`guest`)
- `RABBITMQ_VHOST` (default: `/`)
