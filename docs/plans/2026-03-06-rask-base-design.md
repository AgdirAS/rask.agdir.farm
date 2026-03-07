# Rask — Base Scaffolding Design

**Date:** 2026-03-06
**Status:** Approved / Implemented
**Author:** Agdir Drift AS

---

## Overview

Rask is a modern Next.js UI for RabbitMQ, named after Ratatoskr (the Norse messenger squirrel). It proxies the RabbitMQ Management HTTP API through Next.js API routes — no direct browser-to-RabbitMQ calls.

---

## Architecture Decisions

### Server-first, client islands

Pages default to Server Components. TanStack Query lives only in `"use client"` components that need polling or mutations. Layout and navigation are static server components. `amqplib` is server-only and never imported in client components.

### API route proxy pattern

All RabbitMQ calls go through Next.js API routes. This:
- Keeps credentials server-side only
- Allows future middleware (auth, caching, rate limiting)
- Enables CORS-free client code

### Consistent `{ data, error }` response shape

All API routes return `{ data, error }` to simplify client-side error handling. TanStack Query handles retries and stale/loading states.

### `.env.local` for connection config

Connection settings are stored in `.env.local` and exposed via a settings API route (GET to read, POST to write). The settings UI provides a form-based alternative to editing the file directly. A restart is required for changes to take effect (Next.js limitation).

### TailwindCSS v4

CSS-based configuration (no `tailwind.config.js`). Custom tokens defined via CSS variables in `globals.css`. shadcn components use `oklch` color values for better color management.

---

## File Structure

```
app/
  layout.tsx                    Root: HTML, body, fonts, ThemeProvider + QueryProvider
  (app)/
    layout.tsx                  App shell: Sidebar + Header side by side
    page.tsx                    Overview stub
    queues/page.tsx             Queue list (client, TanStack Query, 10s polling)
    settings/page.tsx           Connection settings form
  api/
    settings/route.ts           GET/POST .env.local read/write
    rabbitmq/queues/route.ts    GET → RabbitMQ /api/queues
    rabbitmq/overview/route.ts  GET → RabbitMQ /api/overview

components/
  layout/sidebar.tsx            Server component nav
  layout/header.tsx             Client component (connection status + theme toggle)
  providers.tsx                 QueryClientProvider + ThemeProvider

lib/
  types.ts                      Queue, Exchange, Overview, Binding types
  rabbitmq.ts                   Authenticated fetch wrapper + exported helpers
  env.ts                        Server-only .env.local read/write
```

---

## Key Constraints

- **No inline `any`** in TypeScript
- **amqplib** is server-only — never import in client components
- **TailwindCSS v4** — CSS-based config, not `tailwind.config.js`
- **GIT Conventional Commits** for all commits
- **API routes** always return `{ data, error }` shape
