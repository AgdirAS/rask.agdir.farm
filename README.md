# Rask

[![CI](https://github.com/agdiras/rask.agdir.farm/actions/workflows/ci.yml/badge.svg)](https://github.com/agdiras/rask.agdir.farm/actions/workflows/ci.yml)
[![License: BSL](https://img.shields.io/badge/license-BSL%201.1-informational)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/agdiras/rask.agdir.farm)](package.json)
[![Stars](https://img.shields.io/github/stars/agdiras/rask.agdir.farm?style=social)](https://github.com/agdiras/rask.agdir.farm)
[![Last Commit](https://img.shields.io/github/last-commit/agdiras/rask.agdir.farm)](https://github.com/agdiras/rask.agdir.farm/commits/main)
[![Issues](https://img.shields.io/github/issues/agdiras/rask.agdir.farm)](https://github.com/agdiras/rask.agdir.farm/issues)

> Named after Ratatoskr, the Norse messenger squirrel.

A modern Next.js UI for RabbitMQ management. Rask proxies the RabbitMQ Management HTTP API through Next.js API routes — no direct browser-to-RabbitMQ calls.

Maintained by [Agdir Drift AS](https://agdir.no).

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | TailwindCSS v4 (CSS-based config) |
| Components | shadcn/ui "new-york" / slate |
| Data fetching | TanStack Query v5 |
| AMQP client | amqplib (server-only) |
| Theme | next-themes |

---

## Quick Start (Docker)

The easiest way to run Rask — no Node.js required.

### Docker

```bash
docker run -d \
  --name rask \
  -p 35672:35672 \
  -e RABBITMQ_HOST=your-rabbitmq-host \
  -e RABBITMQ_USER=guest \
  -e RABBITMQ_PASSWORD=guest \
  ghcr.io/agdiras/rask.agdir.farm:latest
```

Open [http://localhost:35672](http://localhost:35672).

### Docker Compose

```yaml
services:
  rask:
    image: ghcr.io/agdiras/rask.agdir.farm:latest
    ports:
      - "35672:35672"
    environment:
      RABBITMQ_HOST: rabbitmq
      RABBITMQ_MANAGEMENT_PORT: "15672"
      RABBITMQ_AMQP_PORT: "5672"
      RABBITMQ_USER: guest
      RABBITMQ_PASSWORD: guest
      RABBITMQ_VHOST: /
    depends_on:
      rabbitmq:
        condition: service_healthy

  rabbitmq:
    image: rabbitmq:4-management
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
```

Save as `compose.yml` and run:

```bash
docker compose up -d
```

---

## Setup (from source)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure connection

### 3. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:35672](http://localhost:35672).

---

## Environment Variables

Connection settings are managed through the UI (stored in SQLite). On first run a **Localhost** environment is created automatically.

For advanced use, copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_ENCRYPTION_KEY` | _(unset)_ | Encrypt the SQLite DB at rest (any string) |

---

## Architecture

**Server-first, client islands.** Pages default to Server Components. TanStack Query lives only in `"use client"` components that need polling or mutations. Layout and navigation are static server components. `amqplib` is server-only.

```
Browser (React)
  → Next.js API Routes (/api/*)
    → RabbitMQ Management HTTP API (port 15672)
    → RabbitMQ AMQP (port 5672)  ← server-only
```

---

## Project Structure

```
app/
  layout.tsx              Root layout (fonts, providers)
  (app)/
    layout.tsx            App shell (sidebar + header)
    page.tsx              Overview
    queues/page.tsx       Queue list with live polling
    settings/page.tsx     Connection settings
  api/
    settings/route.ts     Read/write connection settings
    rabbitmq/
      queues/route.ts     Proxy → RabbitMQ /api/queues
      overview/route.ts   Proxy → RabbitMQ /api/overview

components/
  layout/
    sidebar.tsx           Navigation sidebar
    header.tsx            Connection status + theme toggle
  providers.tsx           QueryClientProvider + ThemeProvider
  ui/                     shadcn components

lib/
  types.ts                RabbitMQ entity types
  rabbitmq.ts             Management API client
  env.ts                  SQLite env storage + encryption
  utils.ts                cn() utility

docs/
  TODO.md                 Upcoming features
  PRICING.md              Pricing tiers
```

---

## Development

```bash
pnpm dev      # Start dev server
pnpm build    # Production build
pnpm lint     # Lint
```

---

## License & Pricing

Licensed under [BSL 1.1](LICENSE) — free for individuals and teams under 10 users. See [docs/PRICING.md](docs/PRICING.md) for tiers.

Limits are **not technically enforced** — no license keys, no phone-home, no feature gates. If Rask is useful to your organization, please use the right plan.
