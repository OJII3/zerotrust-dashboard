# Oxc Formatting and CI Design

## Goal

Standardize source formatting and JavaScript quality checks with Oxc, including Svelte files, and add a secret-free GitHub Actions validation workflow. Local commands and CI must use the same validation entry point so that a passing local check represents the same requirements as a deployable change.

## Current Context

- The project uses Bun `1.3.13` for dependency installation and scripts.
- The application uses Vite and Svelte 5 for the client, with TypeScript and Cloudflare Workers on the server.
- `svelte-check` is already a development dependency, but it is not currently exposed as a script.
- The existing `check` script runs TypeScript checking, the Vite build, and Wrangler dry-run.
- The existing deploy workflow runs `bun run check` before deployment.
- There is no formatter, JavaScript linter, or general CI workflow for pull requests.

## Scope

This change will:

- Add `oxfmt` for formatting and `oxlint` for JavaScript/TypeScript linting.
- Add repository configuration for both tools.
- Format the existing application and supported project configuration files once.
- Add local scripts for formatting, linting, Svelte checking, and the complete validation sequence.
- Add `.github/workflows/ci.yml` for pull requests, pushes to `main`, and manual runs.
- Keep deployment and Terraform workflows separate from the new validation workflow.
- Update the README with the new local commands and CI checks.

This change will not:

- Change dashboard behavior, API contracts, or deployment credentials.
- Add a pre-commit hook or automatic commits from CI.
- Reformat generated lockfiles, Terraform state files, or existing implementation plans.
- Replace the existing deployment or Terraform workflows.

## Design

### Tool Boundaries

`oxfmt` is responsible for formatting Svelte, TypeScript, JavaScript, CSS, JSON/JSONC, YAML, and Markdown files. Its explicit targets are the application source, public JavaScript, GitHub workflow files, README, and root project configuration files. Lockfiles and historical planning documents are outside the formatter target set to avoid unrelated generated or archival churn.

`oxlint` is responsible for JavaScript and TypeScript correctness checks, including the `<script>` blocks in Svelte files. Svelte template diagnostics remain the responsibility of `svelte-check`, which is the appropriate tool for validating the full Svelte component.

The existing `tsc --noEmit` check remains responsible for the Worker and shared TypeScript configuration. The Svelte-specific `tsconfig.app.json` is passed explicitly to `svelte-check`.

### Formatter Configuration

Add `.oxfmtrc.json` with the local Oxfmt schema and an explicit, stable style:

- `printWidth`: 100
- `tabWidth`: 2
- `useTabs`: false
- `semi`: true
- `singleQuote`: false
- `trailingComma`: `all`
- Package JSON sorting disabled to keep package metadata changes intentional

The formatter commands use the same target list:

```text
src
public
.github/workflows
README.md
package.json
wrangler.jsonc
tsconfig.json
tsconfig.app.json
tsconfig.node.json
vite.config.ts
.oxfmtrc.json
.oxlintrc.json
```

Unsupported asset formats below `src` are ignored by Oxfmt's language detection. `bun.lock`, `flake.lock`, Terraform files, and the existing `docs/superpowers/plans` files are not passed as targets.

### Linter Configuration

Add `.oxlintrc.json` with the local Oxlint schema and enable the `correctness` category at error severity. The initial configuration intentionally does not enable style, pedantic, or experimental categories; this keeps the first adoption focused on high-signal defects rather than producing a large style migration on top of formatting.

The normal lint command passes `--deny-warnings`, so warnings cannot silently pass in local validation or CI. `lint:fix` uses Oxlint's safe automatic fixes only.

### Package Scripts

Add these scripts to `package.json`:

```text
format       -> oxfmt <formatter targets>
format:check -> oxfmt --check <formatter targets>
lint         -> oxlint --deny-warnings src public vite.config.ts
lint:fix     -> oxlint --fix src public vite.config.ts
svelte-check -> svelte-check --tsconfig ./tsconfig.app.json
```

Keep the existing `typecheck`, `test`, `build`, and `dry-run` scripts. Expand `check` into the single validation entry point, in this order:

```text
format:check
lint
svelte-check
typecheck
test
build
dry-run
```

The existing deploy workflow continues to call `bun run check`, so deploys gain the same source checks without duplicating command lists in the deployment workflow.

### GitHub Actions

Add `.github/workflows/ci.yml` with:

- `pull_request` trigger
- Push trigger limited to `main`
- `workflow_dispatch` trigger
- `contents: read` permission
- A concurrency group per workflow and ref, with in-progress cancellation enabled
- One Ubuntu validation job with a 15-minute timeout
- Checkout with persisted credentials disabled
- Bun `1.3.13` setup
- `bun install --frozen-lockfile`
- `bun run check`

The workflow does not receive Cloudflare credentials. The Wrangler dry-run validates the built Worker package without performing a deployment. The existing `deploy.yml` remains responsible for runtime configuration validation and deployment on `main`; `terraform.yml` remains responsible for Terraform-only changes.

Every action added to the new workflow will be pinned to a commit SHA, with a comment identifying the corresponding release version. The workflow will contain no mutable action tag; the selected release and SHA will be recorded directly when the workflow is implemented.

### Documentation

Update the README to:

- Describe the UI as Svelte + Vite rather than the pre-migration static HTML/CSS/JS implementation.
- Document `bun run format`, `bun run format:check`, `bun run lint`, and `bun run svelte-check`.
- State that `bun run check` is the full local validation command.
- Document that CI runs the same validation before changes are merged or deployed.

## Error Handling

- Formatting differences fail `format:check` and report the files that need local formatting.
- Oxlint errors and warnings fail `lint`.
- Svelte diagnostics fail `svelte-check`.
- Existing test, typecheck, build, and dry-run failures continue to stop validation immediately.
- No check may require a Cloudflare secret, network API call, or deployment side effect.

If an existing source construct is incompatible with an Oxc rule, fix the source when the fix is behavior-neutral. A rule suppression is acceptable only when the construct is intentional and the suppression is narrow and documented; broad disabling of correctness checks is out of scope.

## Verification

Implementation verification will run:

```sh
bun run format
bun run format:check
bun run lint
bun run svelte-check
bun run typecheck
bun test
bun run build
bun run dry-run
bun run check
```

The final check also inspects the working tree to confirm that the formatter is stable and that no generated files or secrets were introduced.

## Acceptance Criteria

- `oxfmt` and `oxlint` are locked in `bun.lock` as development dependencies.
- The formatter produces stable output for the targeted Svelte, TypeScript, JavaScript, CSS, JSON/JSONC, YAML, and Markdown files.
- `bun run format:check`, `bun run lint`, and `bun run svelte-check` all pass locally.
- `bun run check` passes locally and includes all seven validation stages.
- The new CI workflow runs on pull requests, `main` pushes, and manual dispatches using frozen Bun dependencies.
- CI passes without Cloudflare secrets and does not deploy.
- The existing deployment workflow still runs the full `check` before deploying.
- README instructions match the actual scripts and CI behavior.
