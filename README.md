# Zero Trust Machines Dashboard

Tailscale-like devices dashboard for Cloudflare Zero Trust. Runs on Cloudflare Workers and is intended to be protected by Cloudflare Access.

## Development

- Use `flake.nix` and `nix develop` for the development environment
- Package manager and local JavaScript runtime: Bun
- Local IaC CLI: OpenTofu
- Deployment runtime: Cloudflare Workers
- API routing: Elysia.js
- UI: Svelte + Vite, built and served through the Worker assets binding

```sh
nix develop
bun install
bun run dev
```

This project intentionally standardizes on Bun for dependency installation and local scripts. Do not use npm or Node.js-specific project metadata as the primary workflow.

### Code quality

Run `bun run format` to apply Oxfmt formatting. Use `bun run format:check` to verify formatting without changing files, `bun run lint` for Oxlint correctness checks, and `bun run svelte-check` for Svelte diagnostics. `bun run check` runs `format:check`, `lint`, `svelte-check`, `typecheck`, tests, the build, and Wrangler dry-run.

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
- `CF_DNS_ZONE_ID`
- `ENABLE_DNS_SYNC`
- `DNS_BASE_DOMAIN`

In deployed environments these values come from GitHub Actions, not from the Cloudflare dashboard. See [GitHub Actions Deployment](#github-actions-deployment).

The token should have these permissions:

- `Zero Trust Read`
- `Cloudflare DEX Read` only when `ENABLE_DEX=true`
- `Zone DNS Edit`, scoped to the zone identified by `CF_DNS_ZONE_ID`, only when `ENABLE_DNS_SYNC=true`

Do not grant Zero Trust write, DEX write, or any DNS permission on zones other than the one `CF_DNS_ZONE_ID` points to.

## GitHub Actions Deployment

Pushes to `main` and manual `workflow_dispatch` runs upload and deploy the Worker with `.github/workflows/deploy.yml`.

Configure these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID used by Wrangler
- `CLOUDFLARE_ACCESS_TOKEN`: deployment token for Wrangler, scoped to edit this Worker
- `CF_ACCOUNT_ID`: Cloudflare account ID queried by the Worker at runtime
- `CF_ACCESS_AUD`: Access audience tag, the OpenTofu output `access_application_aud`
- `CF_API_TOKEN`: read-only Zero Trust token used by the Worker at runtime

Configure these GitHub Actions variables:

- `CF_ACCESS_TEAM_DOMAIN`: Zero Trust team domain, for example `example.cloudflareaccess.com`
- `CF_DNS_ZONE_ID`: Cloudflare zone ID for the zone that hosts `DNS_BASE_DOMAIN`. Only required when `ENABLE_DNS_SYNC=true`.

The workflow uses Bun for install and validation, then deploys with `cloudflare/wrangler-action`. GitHub Actions is the single source of truth for Worker runtime configuration: the deploy step binds `CF_ACCOUNT_ID`, `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as plain vars and uploads `CF_API_TOKEN` as a Worker secret. The deploy no longer passes `--keep-vars`, so vars edited in the Cloudflare dashboard are replaced on the next deploy.

A preceding step fails the run when any of these is unset, or when `CF_ACCESS_TEAM_DOMAIN` does not serve `/cdn-cgi/access/certs`. A wrong team domain otherwise deploys cleanly and only surfaces as `401 Unauthorized` from `/api/devices`, because the Worker cannot fetch the JWKS it verifies the Access JWT against.

`CF_API_TOKEN` is the application runtime token used by the Worker when it calls the Cloudflare Zero Trust API. It is not a Wrangler authentication token. Wrangler authentication uses the `CLOUDFLARE_ACCESS_TOKEN` GitHub secret, mapped to Wrangler's expected `CLOUDFLARE_API_TOKEN` environment variable in CI.

The separate `ci.yml` workflow runs `bun run check` for pull requests, pushes to `main`, and manual runs. It uses frozen Bun dependencies and does not require Cloudflare credentials or deploy the Worker. The existing deployment workflow runs the same check before deployment.

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

## DNS auto-sync

When `ENABLE_DNS_SYNC=true`, a Cron Trigger (`*/5 * * * *`, configured in `wrangler.toml`) runs `reconcileDns` on a schedule. For every device with at least one non-revoked registration, it computes `<slugified-device-name>.<DNS_BASE_DOMAIN>` (default `internal.ojii3.dev`) and creates or updates a DNS-only (unproxied) A record pointing at that registration's WARP virtual IPv4 address, picking the most recently seen active registration when a device has several. Devices with no active registration are skipped. This mirrors Tailscale-style `ssh <hostname>` access: with the Zero Trust Devices WARP Onboarding profile's DNS suffix set to the same `DNS_BASE_DOMAIN`, a bare hostname resolves through WARP to that device's virtual IP.

Each run lists the zone's existing A records, filters to those under `.${DNS_BASE_DOMAIN}`, and only ever creates, updates, or deletes records within that scope — no other record in the zone is touched. A record is deleted once its device no longer has a matching desired hostname (device removed, or its last registration revoked). Same-named devices are disambiguated by appending the first 8 characters of the device ID to every device sharing that name.

## Verification

```sh
bun run check
```
