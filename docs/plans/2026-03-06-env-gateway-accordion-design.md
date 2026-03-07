# Env Gateway Accordion Design

## What

Rewrite `EnvGateway` as a context-aware accordion modal. Replace the separate `ConnectionForm` introduced today. The gateway is the single place for all connection management: first run, connection lost, and switching environments.

## Trigger Reasons

The component receives a `reason` prop that drives header copy and dismissibility:

| reason | trigger | dismissible |
|---|---|---|
| `first-run` | no active env on app load | no |
| `no-connection` | overview query `isError` | no |
| `switch` | user clicks "Switch" in header | yes (✕ button) |

## Props

```ts
type GatewayReason = "first-run" | "no-connection" | "switch";

interface EnvGatewayProps {
  reason: GatewayReason;
  onReady: (slug: string) => void;
  onDismiss?: () => void; // only used when reason === "switch"
}
```

## Header (varies by reason)

| reason | icon | title | subtitle |
|---|---|---|---|
| `first-run` | 🐿 | "Welcome to Rask" | "Add your first RabbitMQ environment" |
| `no-connection` | ServerCrash | "Connection Lost" | "Could not reach [active env name]" |
| `switch` | Server | "Switch Environment" | — |

## Accordion List

Each saved env is one row:

```
[Server icon]  name          [Test] [Connect] [▼]
               host:port
```

Expanded state (chevron rotates, only one open at a time):

```
Name     [__________]   ← live-updates row header as user types
Host     [__________]
Mgmt     [_____]  AMQP [___]
User     [_____]  Pass [___]
VHost    [__________]
                      [Save]
```

## Button Behaviour

- **Test** — `POST /api/settings/test` with that env's current (possibly unsaved) field values. Shows ✓ or error message inline below the row header (not inside the form).
- **Connect** — `POST /api/envs/[slug]/activate` → set sessionStorage → call `onReady(slug)` → modal closes.
- **▼/▲** — toggles form open/close. Only one item expanded at a time (opening one closes others).
- **Save** (inside form) — persists edits via `PUT /api/envs/[slug]` (or `POST /api/envs` for new). Does NOT connect.
- **+ Add environment** — appends a blank row in expanded state with default values pre-filled.

## API Routes Needed

- `GET /api/envs` — list envs + active slug (exists)
- `POST /api/envs` — create new env (exists)
- `PUT /api/envs/[slug]` — update existing env (NEW — needs adding)
- `POST /api/envs/[slug]/activate` — activate (exists)
- `DELETE /api/envs/[slug]` — delete (exists)
- `POST /api/settings/test` — test connection without saving (exists)

## Layout Integration

`app/(app)/layout.tsx`:
- Tracks `reason: GatewayReason | null` in state (null = gateway hidden)
- Sets `reason = "first-run"` when no active env after initial load
- Sets `reason = "no-connection"` when `isError` is signalled from child pages via an `onConnectionError` callback passed through layout
- Sets `reason = "switch"` when user clicks "Switch" in header
- Passes `onDismiss` (sets reason back to null) only for `"switch"`

`app/(app)/page.tsx`:
- Remove `ConnectionForm` component entirely
- Remove the `isError` early return
- Accept `onConnectionError: () => void` prop from layout and call it when `ovErr` becomes true

## Files Changed

- `components/env-gateway.tsx` — full rewrite
- `app/(app)/layout.tsx` — manage reason state, pass `onConnectionError` to children
- `app/(app)/page.tsx` — remove `ConnectionForm`, accept + call `onConnectionError`
- `app/api/envs/[slug]/route.ts` — add `PUT` handler to update an env
