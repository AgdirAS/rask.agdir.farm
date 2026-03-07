# Changelog

All notable changes to Rask are documented here.

## [1.0.0] — 2026-03-06

First public release of Rask — a modern open-source RabbitMQ management dashboard by [Agdir Drift AS](https://agdir.no).

### Pages & Features

**Overview**
- Live stat cards: connections, channels, exchanges, queues, consumers
- Real-time message rate chart (publish + ack) with rolling 60-point buffer
- Queue depth chart — top 5 queues by message count
- Node status table with resource usage bars (FD, sockets, memory, disk)
- System info panel: RabbitMQ version, Erlang version, cluster name, listening ports

**Queues**
- Full queue table with pagination (20/page), search, vhost/type/state filters
- Color-coded rows: red for crashed/backlogged, amber for unacked
- Summary cards: total messages, unacked, consumers, no-consumer queues
- Create Queue dialog with all arguments: TTL, max-length, DLX/DLRK, overflow, lazy mode
- Detail drawer: Overview, Consumers, Messages (peek), Publish/Actions tabs
- Dead Letter Chain tracing in queue drawer — follows DLX chain up to 5 hops
- Purge and delete with confirmation

**Exchanges**
- Exchange table with sort by name/vhost/type/binding-count
- Binding count per exchange, warning for unbound non-fanout exchanges
- Detail drawer: metadata, message rates, bindings list
- **Routing Key Tester** tab — client-side AMQP pattern matching for direct/fanout/topic
- Delete exchange with confirmation

**Bindings**
- Full bindings table with vhost and exchange filters
- Create Binding dialog with source, destination, routing key
- Per-row delete

**Publish**
- Standalone publish page with exchange selector (grouped by vhost)
- Dynamic headers (key-value pairs)
- Body with JSON/plain-text toggle and inline JSON validation
- Content-type, delivery-mode, priority properties
- Publish result feedback: routed / not routed

**Connections & Channels**
- Connection list with state, protocol, SSL, byte rates
- Per-connection channel drill-down
- Close connection action
- Channel list with per-channel consumer/prefetch/confirm stats

**Policies**
- Policy table with pattern, apply-to, priority
- Live pattern preview — highlights matching queues/exchanges as you type
- Full definition builder with all standard policy keys
- Create/edit/delete policies

**Vhosts**
- Vhost table with message/connection stats
- Create vhost with description and default queue type
- Delete and tracing toggle

**Admin (Users & Permissions)**
- User table with tag badges, vhost count
- Create/edit user with tag selection and password
- Permission matrix per vhost/user
- **Definitions Export** — downloads topology as dated JSON file
- **Definitions Import** — drag-and-drop JSON file upload

**Feature Flags**
- List all feature flags with state and stability
- Enable individual flags

**Limits**
- Vhost limits table (max-connections, max-queues)
- Set and delete per-vhost limits

**Settings**
- Connection configuration form
- Connection test with live feedback
- Multi-environment switcher (symlink-based .envs/)

### Infrastructure

- **Docker** — multi-stage standalone `Dockerfile`, `docker-compose.yml`, `docker-compose.test.yml`
- **Vitest** — unit tests for `lib/env.ts` and `lib/rabbitmq.ts`
- **Playwright** — e2e test suites for queues, exchanges, publish flows
- **GitHub Actions CI** — lint/build, unit tests, e2e tests (3 jobs)
- **Next.js standalone output** — lean production image (~200MB vs 1GB+)

### Architecture

- Next.js 16 App Router, React 19, TypeScript 5
- TailwindCSS v4 CSS-first config, shadcn/ui new-york/slate
- TanStack Query v5 — 5s polling on data pages
- All RabbitMQ calls proxied through Next.js API routes (no direct browser access)
- Server Components by default; client islands only for interactive/polling pages
- `amqplib` server-only for AMQP peek/publish operations
