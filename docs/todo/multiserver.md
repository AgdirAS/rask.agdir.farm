# Multi-Server / Merged View

Connect to multiple RabbitMQ instances simultaneously rather than switching between them one at a time.

## Two Approaches

### A) Side-by-side panels (simpler, ~1.5 days)
Show two instances in a split view, each polling independently. User selects which brokers are "active" (a set, not a single one).

### B) Unified aggregated view (harder, ~3 days)
Merge queues/exchanges from all selected brokers into one table. Requires namespacing (e.g. `prod::tasks`, `staging::tasks`) to handle collisions, and server-side fan-out aggregation.

## Key Architectural Changes

1. **Parameterize API routes** — every proxy route under `app/api/rabbitmq/` needs to accept `?broker=slug` and route to the right connection config. This is the load-bearing change.

2. **`getConnectionConfig(slug?)`** — change signature to accept an optional slug instead of always reading the current symlink. Fall back to active symlink if no slug given.

3. **Active set instead of active single** — replace the single-symlink concept with a stored set of active slugs (could be a JSON file or a cookie/session).

4. **UI fan-out** — TanStack Query calls fan out across all active broker slugs and results are merged/rendered per-broker.

5. **Name disambiguation** — prefix entity names with broker slug where needed (especially in unified view).

## Starting Point

The lowest-risk first step is (1): add `?broker=slug` support to API routes without breaking existing behavior. Once routes are parameterizable, everything else builds on top cleanly.
