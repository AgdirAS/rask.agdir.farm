# Rask

[![CI](https://github.com/agdir/rask/actions/workflows/ci.yml/badge.svg)](https://github.com/agdir/rask/actions/workflows/ci.yml)
[![License: BSL](https://img.shields.io/badge/license-BSL%201.1-informational)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/agdir/rask)](package.json)
[![Stars](https://img.shields.io/github/stars/agdir/rask?style=social)](https://github.com/agdir/rask)
[![Last Commit](https://img.shields.io/github/last-commit/agdir/rask)](https://github.com/agdir/rask/commits/main)
[![Issues](https://img.shields.io/github/issues/agdir/rask)](https://github.com/agdir/rask/issues)

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
  ghcr.io/agdir/rask:latest
```

Open [http://localhost:35672](http://localhost:35672).

### Docker Compose

```yaml
services:
  rask:
    image: ghcr.io/agdir/rask:latest
    ports:
      - "35672:35672"
    environment:
      RABBITMQ_HOST: rabbitmq
      RABBITMQ_USER: guest
      RABBITMQ_PASSWORD: guest
    depends_on:
      rabbitmq:
        condition: service_healthy
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:4-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
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

Copy the example env file and fill in your RabbitMQ details:

```bash
cp .env.local.example .env.local
```

### 3. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:35672](http://localhost:35672).

---

## Environment Variables

All variables go in `.env.local`. None are required for the app to start — defaults are used if not set.

| Variable | Default | Description |
|----------|---------|-------------|
| `RABBITMQ_HOST` | `localhost` | RabbitMQ server hostname or IP |
| `RABBITMQ_MANAGEMENT_PORT` | `15672` | Management HTTP API port |
| `RABBITMQ_AMQP_PORT` | `5672` | AMQP protocol port |
| `RABBITMQ_USER` | `guest` | RabbitMQ username |
| `RABBITMQ_PASSWORD` | `guest` | RabbitMQ password |
| `RABBITMQ_VHOST` | `/` | Default virtual host |

You can also set these via the Settings page in the UI (`/settings`) — but **restart the dev server** after saving for changes to take effect.

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
    settings/route.ts     Read/write .env.local
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
  env.ts                  Server-only .env.local helpers
  utils.ts                cn() utility

docs/
  PROGRESS.md             V1 feature checklist
  plans/                  Design documents
```

---

## Development

```bash
pnpm dev      # Start dev server
pnpm build    # Production build
pnpm lint     # Lint
```
