# Oxc Formatting and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Oxfmt and Oxlint-based source checks for the Svelte/TypeScript project and enforce the complete validation sequence in GitHub Actions.

**Architecture:** Keep formatting, linting, Svelte checking, tests, build, and Wrangler dry-run as independent package scripts, then compose them in the existing `check` script. Add a secret-free CI workflow that calls this single entry point, while leaving deployment and Terraform workflows responsible for their existing domains.

**Tech Stack:** Bun 1.3.13, Oxfmt, Oxlint, Svelte 5, `svelte-check`, TypeScript, Vite, Wrangler, GitHub Actions.

---

## File Map

### Tooling and scripts

- Create: `.oxfmtrc.json` - repository-wide Oxfmt settings.
- Create: `.oxlintrc.json` - repository-wide Oxlint correctness settings.
- Modify: `package.json` - Oxc development dependencies and local validation scripts.
- Modify: `bun.lock` - lock the new development dependencies.

### Initial formatting targets

The first `bun run format` invocation will modify only supported files under the formatter target list. The expected source and configuration files are:

- `src/App.svelte`
- `src/app.css`
- `src/client/index.html`
- `src/client/svelte.config.js`
- `src/client/src/App.svelte`
- `src/client/src/app.css`
- `src/client/src/lib/Counter.svelte`
- `src/client/src/main.ts`
- `src/lib/dashboard.test.ts`
- `src/lib/dashboard.ts`
- `src/server/access.ts`
- `src/server/cloudflare-api.ts`
- `src/server/dashboard.ts`
- `src/server/devices.ts`
- `src/server/dns.ts`
- `src/server/env.test.ts`
- `src/server/env.ts`
- `src/server/index.ts`
- `public/dashboard-renderers.js`
- `.github/workflows/deploy.yml`
- `.github/workflows/terraform.yml`
- `README.md`
- `package.json`
- `wrangler.jsonc`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `vite.config.ts`
- `.oxfmtrc.json`
- `.oxlintrc.json`

Do not manually reformat `bun.lock`, `flake.lock`, Terraform files, `test/dashboard-renderers.test.ts`, or files under `docs/superpowers/plans` as part of this change; they are outside the approved formatter target list.

### CI and documentation

- Create: `.github/workflows/ci.yml` - pull request, `main` push, and manual validation workflow.
- Modify: `README.md` - document Svelte/Vite, local tooling commands, and CI behavior.

---

### Task 1: Add Oxc tooling and validation scripts

**Files:**
- Create: `.oxfmtrc.json`
- Create: `.oxlintrc.json`
- Modify: `package.json:7-15,20-35`
- Modify: `bun.lock`

- [ ] **Step 1: Add the Oxc packages with Bun**

Run:

```sh
bun add --dev oxfmt oxlint
```

Expected result: `package.json` and `bun.lock` gain `oxfmt` and `oxlint` under development dependencies, with no npm metadata files created.

- [ ] **Step 2: Add the formatter configuration**

Create `.oxfmtrc.json` with exactly:

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "sortPackageJson": false
}
```

- [ ] **Step 3: Add the linter configuration**

Create `.oxlintrc.json` with exactly:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error"
  }
}
```

- [ ] **Step 4: Add package scripts**

Update the `scripts` object in `package.json` so it contains these exact entries while preserving the existing `dev`, `build`, `deploy`, `dry-run`, `test`, and `typecheck` commands:

```json
{
  "format": "oxfmt src public .github/workflows README.md package.json wrangler.jsonc tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts .oxfmtrc.json .oxlintrc.json",
  "format:check": "oxfmt --check src public .github/workflows README.md package.json wrangler.jsonc tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts .oxfmtrc.json .oxlintrc.json",
  "lint": "oxlint --deny-warnings src public vite.config.ts",
  "lint:fix": "oxlint --fix src public vite.config.ts",
  "svelte-check": "svelte-check --tsconfig ./tsconfig.app.json",
  "check": "bun run format:check && bun run lint && bun run svelte-check && bun run typecheck && bun test && bun run build && bun run dry-run"
}
```

The formatter target list must be identical in `format` and `format:check`. `check` must run these seven stages in order: format check, lint, Svelte check, TypeScript check, tests, build, and Wrangler dry-run.

- [ ] **Step 5: Verify the tool commands resolve**

Run:

```sh
bun run format:check
bun run lint
bun run svelte-check
```

Expected result: the commands start using the local binaries. `format:check` may report existing formatting differences until Task 2 is complete; any lint or Svelte diagnostics must be recorded for Task 3.

- [ ] **Step 6: Commit the tooling setup**

```sh
git add package.json bun.lock .oxfmtrc.json .oxlintrc.json
git commit -m "build: add Oxc tooling and validation scripts"
```

### Task 2: Apply the initial Oxfmt formatting

**Files:**
- Modify: the supported files listed in the `Initial formatting targets` section above.

- [ ] **Step 1: Format the approved target list**

Run:

```sh
bun run format
```

Expected result: Oxfmt rewrites only supported files in `src`, `public`, `.github/workflows`, `README.md`, and the listed root configuration files. It must not modify `bun.lock`, `flake.lock`, Terraform files, `test/dashboard-renderers.test.ts`, or `docs/superpowers/plans`.

- [ ] **Step 2: Check the formatting-only diff**

Run:

```sh
git diff --check
git diff --stat
git status --short
```

Expected result: no whitespace errors; the diff is limited to Oxfmt output in approved targets; no new generated files, lockfiles, or secrets appear.

- [ ] **Step 3: Verify formatting is stable**

Run:

```sh
bun run format:check
```

Expected result: exit status 0 with no files reported.

- [ ] **Step 4: Commit the formatting baseline**

```sh
git add src public .github/workflows README.md package.json wrangler.jsonc tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts .oxfmtrc.json .oxlintrc.json
git commit -m "style: format project with Oxfmt"
```

### Task 3: Resolve Oxc and Svelte diagnostics without behavior changes

**Files:**
- Modify: only files named by Oxlint or `svelte-check` diagnostics, expected primarily under `src/`.
- Test: existing `src/**/*.test.ts` and `test/dashboard-renderers.test.ts` suites.

- [ ] **Step 1: Run Oxlint with warnings denied**

Run:

```sh
bun run lint
```

Expected result: exit status 0. If Oxlint reports an existing correctness diagnostic, apply the smallest behavior-neutral source fix or a narrow, documented suppression for an intentional construct. Do not disable the correctness category globally and do not enable unrelated style categories.

- [ ] **Step 2: Run Svelte template and script checking**

Run:

```sh
bun run svelte-check
```

Expected result: exit status 0 with no Svelte errors or warnings that can fail CI. Fix only actual source/configuration issues exposed by the check; do not change dashboard behavior.

- [ ] **Step 3: Run the existing regression tests**

Run:

```sh
bun test
```

Expected result: all existing tests pass, including `src/lib/dashboard.test.ts`, `src/server/env.test.ts`, and `test/dashboard-renderers.test.ts`.

- [ ] **Step 4: Commit any source-only diagnostic fixes**

```sh
git add src public vite.config.ts
git commit -m "chore: satisfy Oxc and Svelte checks"
```

If Step 1 and Step 2 require no source changes, do not create an empty commit.

### Task 4: Add the secret-free GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the pinned workflow**

Create `.github/workflows/ci.yml` with exactly this behavior:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          persist-credentials: false

      - name: Setup Bun
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.13

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Validate
        run: bun run check
```

- [ ] **Step 2: Format and inspect the workflow**

Run:

```sh
bun run format
bun run format:check
```

Expected result: the workflow remains semantically equivalent, format check passes, and the YAML has no whitespace errors. Do not replace the pinned SHAs with mutable version tags.

- [ ] **Step 3: Run the same validation locally**

Run:

```sh
bun run check
```

Expected result: all seven validation stages pass without Cloudflare credentials or a deployment side effect.

- [ ] **Step 4: Commit the CI workflow**

```sh
git add .github/workflows/ci.yml
git commit -m "ci: validate Oxc and Svelte checks"
```

### Task 5: Document the local workflow and CI contract

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Correct the UI technology description**

Change the Development technology list entry from:

```text
- UI: static HTML/CSS/JS served by the Worker assets binding
```

to:

```text
- UI: Svelte + Vite, built and served through the Worker assets binding
```

- [ ] **Step 2: Add local quality commands**

Add a `Code quality` subsection after the development command block:

```markdown
### Code quality

Run `bun run format` to apply Oxfmt formatting. Use `bun run format:check` to verify formatting without changing files, `bun run lint` for Oxlint correctness checks, and `bun run svelte-check` for Svelte diagnostics. `bun run check` runs all of these checks plus tests, the build, and Wrangler dry-run.
```

- [ ] **Step 3: Document CI behavior**

Add the following paragraph to the GitHub Actions section:

```markdown
The separate `ci.yml` workflow runs `bun run check` for pull requests, pushes to `main`, and manual runs. It uses frozen Bun dependencies and does not require Cloudflare credentials or deploy the Worker. The existing deployment workflow runs the same check before deployment.
```

- [ ] **Step 4: Make the verification section use the full check**

Replace the existing Verification command block:

```sh
bun run typecheck
bun run dry-run
```

with:

```sh
bun run check
```

- [ ] **Step 5: Verify the documentation and commit it**

Run:

```sh
bun run format
bun run format:check
git diff --check
```

Expected result: README formatting is stable and the documented commands exactly match `package.json`.

```sh
git add README.md
git commit -m "docs: document Oxc checks and CI"
```

### Task 6: Final verification and worktree review

**Files:**
- Verify: all files changed by Tasks 1-5.

- [ ] **Step 1: Run the complete command set**

Run:

```sh
bun run format:check
bun run lint
bun run svelte-check
bun run typecheck
bun test
bun run build
bun run dry-run
bun run check
```

Expected result: every command exits with status 0. `bun run check` repeats the same seven stages as the final integration check.

- [ ] **Step 2: Inspect the final diff and status**

Run:

```sh
git status --short
git diff --check
git log --oneline -6
```

Expected result: there are no uncommitted changes, no whitespace errors, the implementation commits are present, and no unrelated files were changed.
