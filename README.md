# Zero Trust Machines Dashboard

Tailscale-like devices dashboard for Cloudflare Zero Trust. Runs on Cloudflare Workers and is intended to be protected by Cloudflare Access.

## Development

- Use `flake.nix` and `nix develop` for the development environment
- Package manager and local JavaScript runtime: Bun
- Deployment runtime: Cloudflare Workers
- API routing: Elysia.js
- UI: static HTML/CSS/JS served by the Worker assets binding

```sh
nix develop
bun install
bun run dev
```

This project intentionally standardizes on Bun for dependency installation and local scripts. Do not use npm or Node.js-specific project metadata as the primary workflow.

## Configuration

Copy `.dev.vars.example` to `.dev.vars` for local development and set:

- `CF_ACCOUNT_ID`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `CF_API_TOKEN`
- `REFRESH_INTERVAL_SECONDS`
- `RECENTLY_SEEN_THRESHOLD_SECONDS`
- `STALE_THRESHOLD_DAYS`
- `ENABLE_DEX`

Set the API token as a Worker secret in deployed environments:

```sh
wrangler secret put CF_API_TOKEN
```

The token should have read-only permissions:

- `Zero Trust Read`
- `Cloudflare DEX Read` only when `ENABLE_DEX=true`

Do not grant Zero Trust write or DEX write permissions.

## Endpoints

- `GET /api/devices`

The Worker fetches Cloudflare physical devices and device registrations with GET requests only, groups registrations by physical device ID, removes sensitive registration fields such as `key`, and returns normalized dashboard data to the browser.

When `ENABLE_DEX=true`, the Worker also fetches DEX fleet status and uses it to display connected/offline status. When disabled, status falls back to `last_seen_at` and avoids claiming real-time online state.

## Verification

```sh
bun run typecheck
bun run dry-run
```
