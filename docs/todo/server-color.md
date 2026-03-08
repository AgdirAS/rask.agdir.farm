# Server Color Feature

## Goal

Allow each environment to have a background color and text color. The active server's colors are applied to the `ServerPanel` at the top of the sidebar so users can instantly see which environment they are on (e.g. orange for staging, red for production).

## Data Layer

- Add `bgColor?: string` and `textColor?: string` to `EnvEntry` in `lib/types.ts`
- `serializeEnv` in `lib/env.ts` writes `RASK_ENV_BG_COLOR` and `RASK_ENV_TEXT_COLOR` to the `.env` file
- `listEnvs` in `lib/env.ts` parses and returns both fields
- API routes (`POST /api/envs`, `PUT /api/envs/[slug]`) already pass through `EnvEntry` — no route changes needed beyond accepting the new fields

## UI — EnvGateway (add + edit forms)

- In both the new-env form and the expanded edit form, add a color picker row below the Display Name field
- Two `<input type="color">` pickers: **Background** and **Text Color**
- Defaults to empty (no color override) — use a checkbox or a reset button to clear

## Sidebar — ServerPanel

- Fetch active env colors from `/api/envs` (already called by the layout or gateway)
- Pass `bgColor` and `textColor` as props to `ServerPanel`
- Apply as `style={{ backgroundColor: bgColor, color: textColor }}` on the panel wrapper — only when non-empty

## Files to Change

| File | Change |
|---|---|
| `lib/types.ts` | Add `bgColor?` and `textColor?` to `EnvEntry` |
| `lib/env.ts` | Update `serializeEnv` and `listEnvs` to handle color fields |
| `components/env-gateway.tsx` | Add color pickers to new-env and edit forms |
| `components/layout/sidebar.tsx` | Fetch active env, pass colors to `ServerPanel`, apply inline style |
