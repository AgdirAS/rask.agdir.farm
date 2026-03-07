# Queues Page — Design

**Date:** 2026-03-06
**Status:** Approved

## Overview

Full redesign of `app/(app)/queues/page.tsx` to match the RabbitMQ Management dashboard standard. Follows the connections page pattern — summary cards, filters, paginated sortable table with critical row highlighting, slide-in detail drawer.

## Files Changed

| File | Action |
|------|--------|
| `lib/types.ts` | Add `type`, `consumer_details` to Queue; add QueueMessage type |
| `lib/rabbitmq.ts` | Add getQueueDetail, purgeQueue, deleteQueue, getMessages, publishMessage |
| `app/api/rabbitmq/queues/[vhost]/[name]/route.ts` | DELETE queue |
| `app/api/rabbitmq/queues/[vhost]/[name]/purge/route.ts` | POST purge |
| `app/api/rabbitmq/queues/[vhost]/[name]/get/route.ts` | POST peek messages |
| `app/api/rabbitmq/queues/[vhost]/[name]/publish/route.ts` | POST publish message |
| `app/(app)/queues/page.tsx` | Full rewrite |

## Page Layout

1. **Header** — "Queues" title + total count badge
2. **Summary bar** — total messages, total unacked (amber if >0), total consumers, queues-with-no-consumers (red if >0)
3. **Filters** — vhost, type (classic/quorum/stream), state, search by name
4. **Table** — name, vhost, type badge, state badge, ready, unacked, consumers, incoming rate, deliver rate, memory, DLX icon
5. **Detail drawer** — 4 tabs: Overview | Consumers | Messages | Publish + Actions

## Critical Row Highlighting

- Red: `messages > 0 && consumers === 0` — consumer-less backlog
- Red: `state === "crashed" || state === "down"`
- Yellow: `messages_unacknowledged > 0`

## Detail Drawer Tabs

### Overview
Full metadata grid: durable, auto-delete, exclusive, node, memory, idle since, arguments. DLX/TTL from arguments if set.

### Consumers
Live list polling every 5s: consumer tag, channel, ack mode, prefetch count.

### Messages
Peek N messages (1/5/10/50). Non-destructive via `ackmode: "ack_requeue_true"`. Show payload (pretty-print JSON if valid), routing key, properties, headers.

### Publish + Actions
- Publish form: routing key, payload (textarea), content-type, headers (JSON), persistent flag
- Purge button (confirm dialog) — disabled for stream queues
- Delete button (confirm dialog)

## Auto-refresh

5s interval via `refetchInterval`. Last-updated timestamp in table footer.

## Type Changes

```ts
export interface Queue {
  // existing fields...
  type: "classic" | "quorum" | "stream";
  consumer_details?: ConsumerDetail[];
}

export interface ConsumerDetail {
  consumer_tag: string;
  channel_details: { name: string; peer_host: string; peer_port: number };
  ack_required: boolean;
  prefetch_count: number;
  exclusive: boolean;
}

export interface QueueMessage {
  payload: string;
  payload_encoding: "string" | "base64";
  routing_key: string;
  exchange: string;
  redelivered: boolean;
  properties: Record<string, unknown>;
  headers?: Record<string, unknown>;
  message_count: number;
}
```
