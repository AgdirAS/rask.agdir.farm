# Rask V1 Feature Checklist

## Base Scaffold
- [x] Next.js app shell (sidebar + header)
- [x] TailwindCSS v4 + shadcn/ui setup
- [x] TanStack Query provider
- [x] next-themes (light / dark / system)
- [x] Connection settings page (`/settings`)
- [x] Queue list page (`/queues`) with 10s polling
- [x] RabbitMQ Management API proxy routes
- [x] `.env.local` read/write via API

## Queue Management
- [ ] Queue detail page (`/queues/[name]`)
- [ ] Queue message browser
- [ ] Purge queue action
- [ ] Delete queue action
- [ ] Create queue form

## Exchange Management
- [ ] Exchange list page (`/exchanges`)
- [ ] Exchange detail page (`/exchanges/[name]`)

## Bindings
- [ ] Bindings list page (`/bindings`)
- [ ] Create binding form
- [ ] Delete binding action

## Publish
- [ ] Publish message page (`/publish`)
- [ ] Select exchange + routing key
- [ ] Message body editor (JSON / plain text)
- [ ] Publish confirmation

## Overview Dashboard
- [ ] Broker stats (message rates, connections, channels)
- [ ] Node health indicators
- [ ] Recent activity feed

## Infrastructure
- [ ] Docker Compose example (RabbitMQ + Rask)
- [ ] Production build notes
- [ ] Authentication / multi-broker support
