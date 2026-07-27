# Zero Trust Machines Dashboard

Tailscale-like devices dashboard for Cloudflare Zero Trust. Runs on Cloudflare Workers and is intended to be protected by Cloudflare Access.

## Development

- Use `flake.nix` and `nix develop` for the development environment
- Package manager and local JavaScript runtime: Bun
- Local IaC CLI: OpenTofu
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

## GitHub Actions Deployment

Pushes to `main` and manual `workflow_dispatch` runs upload and deploy the Worker with `.github/workflows/deploy.yml`.

Configure these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID used by Wrangler
- `CLOUDFLARE_ACCESS_TOKEN`: deployment token for Wrangler, scoped to edit this Worker

Configure Worker runtime variables and secrets in Cloudflare before deployment:

- `CF_ACCOUNT_ID`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `CF_API_TOKEN`

The workflow uses Bun for install and validation, then deploys with `cloudflare/wrangler-action`. It does not pass application runtime `CF_*` values through GitHub Actions.

`CF_API_TOKEN` is the application runtime token used by the Worker when it calls the Cloudflare Zero Trust API. It is not a Wrangler authentication token. Wrangler authentication uses the `CLOUDFLARE_ACCESS_TOKEN` GitHub secret, mapped to Wrangler's expected `CLOUDFLARE_API_TOKEN` environment variable in CI.

## Terraform

Cloudflare Access is managed from `terraform/`. OpenTofu state is stored in Cloudflare R2 through the S3 backend.

Configure these GitHub Actions secrets for `.github/workflows/terraform.yml`:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCESS_TOKEN`: Cloudflare API token with Access Apps and Policies write permissions
- `TF_STATE_R2_ACCESS_KEY_ID`
- `TF_STATE_R2_SECRET_ACCESS_KEY`

Configure these GitHub Actions variables:

- `TF_STATE_R2_BUCKET`: R2 bucket for Terraform state
- `TF_STATE_R2_KEY`: state object key, for example `zerotrust-dashboard/terraform.tfstate`
- `ACCESS_APPLICATION_DOMAIN`: Access-protected hostname, for example `machines.example.com`
- `ACCESS_POLICY_INCLUDE_JSON`: Access include rules as JSON, for example `[{"email":{"email":"admin@example.com"}}]`
- `WORKER_CUSTOM_DOMAIN_JSON`: optional Worker custom domain config, for example `{"zone_name":"example.com","service":"zerotrust-dashboard"}`

The OpenTofu workflow runs `plan` on pull requests and `apply` on pushes to `main`. After the first apply, set the Worker runtime variable `CF_ACCESS_AUD` to the OpenTofu output `access_application_aud`.

For local work:

```sh
cd terraform
tofu init -backend-config=backend.r2.hcl
tofu plan
```

## Endpoints

- `GET /api/devices`

The Worker fetches Cloudflare physical devices and device registrations with GET requests only, groups registrations by physical device ID, removes sensitive registration fields such as `key`, and returns normalized dashboard data to the browser.

When `ENABLE_DEX=true`, the Worker also fetches DEX fleet status and uses it to display connected/offline status. When disabled, status falls back to `last_seen_at` and avoids claiming real-time online state.

## Verification

```sh
bun run typecheck
bun run dry-run
```
