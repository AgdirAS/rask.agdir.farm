# Environment Gateway Design

**Date:** 2026-03-06
**Status:** Approved
**Author:** Agdir Drift AS

---

## Overview

Rask supports multiple named RabbitMQ environments stored as server-side files. A full-screen gateway lets users pick or create an environment before entering the app. The active environment is tracked via a symlink so all API calls use the correct credentials without a server restart.

---

## Storage

```
.envs/
  localhost.env      # KEY=VALUE pairs for each environment
  staging.env
  production.env
.env.local           # symlink → .envs/{active-slug}.env
```

- `.envs/` and `.env.local` are gitignored and never served as static files
- Each `.env` file is a plain key=value file with the 6 standard RabbitMQ vars
- `lib/env.ts` already reads `.env.local` via `fs.readFileSync` on every request, so symlink updates take effect immediately — no restart needed

---

## Gateway Trigger Logic (client-side)

1. App loads → check `sessionStorage.getItem('rask-env')`
2. If set → skip gateway, load app normally
3. If not set → fetch `GET /api/envs` → check if any envs exist AND symlink is active
4. If active symlink exists → skip gateway, set sessionStorage, show "Switch Env" in header
5. If no envs or no active symlink → show full-screen gateway (mandatory, not dismissible)

---

## Gateway UI

- Full-screen centered modal overlay (z-50, backdrop blur)
- **Rask logo + "Select Environment"** heading
- **Env cards** — one per `.envs/*.env` file, showing:
  - Display name + slug
  - Host + port
  - Reachability status dot (fetched lazily)
  - Delete button (with confirmation)
- **"Add New"** button opens inline form:
  - Slug (validated: lowercase, letters/digits/dash/underscore, required)
  - Display name (free text)
  - Host, Management Port, AMQP Port, User, Password, VHost
- Clicking an env card → activates it (updates symlink) → sets sessionStorage → dismisses gateway

---

## Header Addition

- Small **"Switch Env"** button (or current env name as a chip) in the header
- Clicking it re-opens the gateway overlay (with current env pre-highlighted)

---

## API Routes

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/envs` | List all `.envs/*.env` files + active slug (symlink target) |
| `POST` | `/api/envs` | Create new `.envs/{slug}.env` file |
| `POST` | `/api/envs/[slug]/activate` | Update `.env.local` symlink to point to `{slug}.env` |
| `DELETE` | `/api/envs/[slug]` | Delete `.envs/{slug}.env`, clear symlink if it was active |

All return `{ data, error }` shape.

---

## Validation

Slug regex: `/^[a-z0-9][a-z0-9_-]*$/`

---

## Files to Create / Modify

```
lib/env.ts                          modify — add multi-env helpers
app/api/envs/route.ts               create — GET list, POST create
app/api/envs/[slug]/route.ts        create — DELETE
app/api/envs/[slug]/activate/route.ts  create — POST activate
components/env-gateway.tsx          create — full-screen gateway
components/layout/header.tsx        modify — add Switch Env chip
app/(app)/layout.tsx                modify — wrap with gateway check
```
