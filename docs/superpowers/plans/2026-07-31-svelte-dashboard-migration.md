# Svelte Dashboard Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy DOM-rendered Zero Trust dashboard with a responsive Svelte + Skeleton implementation while preserving the existing `/api/devices` behavior.

**Architecture:** Keep data loading and page-level state in `src/App.svelte`, move pure device filtering, sorting, labels, and date formatting into `src/lib/dashboard.ts`, and split the UI into focused Svelte components. Render device data through Svelte templates instead of HTML strings, with the selected device passed into a drawer component.

**Tech Stack:** Svelte 5, TypeScript, Vite, Tailwind CSS v4, Skeleton, Bun test, Cloudflare Workers assets.

---

## File Map

- Create `src/lib/dashboard.ts`: API response types, status labels/ranks, filtering, sorting, OS/profile helpers, badges, and date formatting.
- Create `src/lib/dashboard.test.ts`: pure helper tests for filtering, sorting, status labels, counts, and date behavior.
- Create `src/components/DashboardHeader.svelte`: title, viewer, updated time, auto-refresh label, refresh action.
- Create `src/components/SummaryMetrics.svelte`: four summary cards.
- Create `src/components/DeviceToolbar.svelte`: search, OS/status/profile filters, and sort control.
- Create `src/components/Notice.svelte`: warning/error notice.
- Create `src/components/DeviceTable.svelte`: responsive table and empty/loading states.
- Create `src/components/DeviceRow.svelte`: one device row and copy actions.
- Create `src/components/DeviceDrawer.svelte`: selected device detail panel and registrations.
- Replace `src/App.svelte`: page state, API lifecycle, derived filtered devices, and component composition.
- Replace `src/app.css`: global Skeleton/Tailwind theme and dashboard-specific responsive styling.
- Modify `src/client/src/main.ts` only if the current entrypoint does not mount the root `src/App.svelte`; otherwise leave the generated client scaffold untouched.
- Modify `src/client/index.html` only to ensure the document title and root mount point are correct.

### Task 1: Add Pure Dashboard Domain Helpers

**Files:**
- Create: `src/lib/dashboard.ts`
- Create: `src/lib/dashboard.test.ts`

- [ ] **Step 1: Write failing tests for helper behavior**

Add tests covering:

```ts
import { describe, expect, test } from "bun:test";
import { activeCount, filterDevices, osName, sortDevices, statusLabels } from "./dashboard";

const devices = [
  { id: "a", name: "alpha", status: "stale", deviceType: "Windows", registrations: [], lastSeenAt: "2026-07-29T00:00:00Z" },
  { id: "b", name: "beta", status: "connected", deviceType: "Darwin", registrations: [{ status: "active" }], lastSeenAt: "2026-07-30T00:00:00Z" }
] as any[];

test("normalizes operating system names", () => {
  expect(osName("Darwin 24")).toBe("macOS");
  expect(osName("Windows 11")).toBe("Windows");
});

test("filters by query and status label", () => {
  expect(filterDevices(devices, { query: "beta", os: "", status: "Connected", profile: "" })).toHaveLength(1);
  expect(statusLabels.connected).toBe("Connected");
});

test("sorts by last seen descending and counts active registrations", () => {
  expect(sortDevices(devices, "lastSeen")[0].id).toBe("b");
  expect(activeCount(devices[1])).toBe(1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/lib/dashboard.test.ts`

Expected: FAIL because `src/lib/dashboard.ts` does not exist yet.

- [ ] **Step 3: Implement the pure helpers**

Define types from `DashboardDevice` and the server `DevicesPayload`, then implement `filterDevices(devices, filters)`, `sortDevices(devices, mode)`, `activeCount`, `firstEmail`, `osName`, `profileName`, `badges`, `searchBlob`, `dateValue`, `relativeTime`, `formatAbsolute`, and `formatMaybeDate`. Preserve the legacy status rank ordering and all sort modes. Avoid HTML escaping because Svelte templates escape text by default.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `bun test src/lib/dashboard.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the helper module and tests**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts
git commit -m "feat: add dashboard domain helpers"
```

### Task 2: Build Presentational Svelte Components

**Files:**
- Create: `src/components/DashboardHeader.svelte`
- Create: `src/components/SummaryMetrics.svelte`
- Create: `src/components/DeviceToolbar.svelte`
- Create: `src/components/Notice.svelte`
- Create: `src/components/DeviceRow.svelte`
- Create: `src/components/DeviceTable.svelte`
- Create: `src/components/DeviceDrawer.svelte`

- [ ] **Step 1: Define component props and events**

Use typed Svelte 5 props. `DashboardHeader` receives `deviceCount`, `viewer`, `updated`, `autoRefresh`, `loading`, and an `onrefresh` callback. `SummaryMetrics` receives the four numeric summary values. `DeviceToolbar` receives filter option arrays and a `filters` object, and emits changes through callbacks. `DeviceTable` receives filtered devices, partial registration failure state, loading state, and an `onselect` callback. `DeviceRow` receives a single `DashboardDevice` and an `onselect` callback. `DeviceDrawer` receives `device`, `dnsEnabled`, and `onclose`.

- [ ] **Step 2: Implement the header, metrics, toolbar, notice, and table markup**

Use Skeleton primitives where available, semantic `header`, `section`, `table`, `button`, `input`, and `select` elements otherwise. Use `#each` blocks for rows and registrations. Keep copy buttons inside rows from triggering row selection by stopping propagation. Add keyboard activation for table rows with Enter and accessible labels for controls.

- [ ] **Step 3: Implement the drawer and registration details**

Render basic device key/value details, optional DNS hostname, DEX details, and every registration. Add copy buttons for DNS and IPv4/IPv6 values. Toggle `aria-hidden`, focus-visible styles, and a backdrop. Close on backdrop click and Escape through a window listener that is installed only while a device is open.

- [ ] **Step 4: Run type checking**

Run: `bun run typecheck`

Expected: PASS, or only temporary errors caused by the not-yet-wired `App.svelte`; fix component prop and event types before continuing.

- [ ] **Step 5: Commit the presentational components**

```bash
git add src/components
git commit -m "feat: add svelte dashboard components"
```

### Task 3: Wire App State and API Lifecycle

**Files:**
- Replace: `src/App.svelte`

- [ ] **Step 1: Add page state and API types**

Create state for `devices`, `summary`, `meta`, `viewer`, `loading`, `error`, `selectedDevice`, and filter values. Use Svelte reactive declarations or Svelte 5 runes consistently with the project compiler configuration. Initialize loading by calling `loadDevices(false)` on mount.

- [ ] **Step 2: Implement `loadDevices(manual)`**

Fetch `/api/devices${manual ? "?refresh=1" : ""}` with `Accept: application/json`, parse the response, throw the server `error` for non-2xx responses, update state, and recreate the auto-refresh interval from `meta.refreshIntervalSeconds` with a minimum of 15 seconds. Preserve existing devices during background refresh and disable only the refresh action while a request is active.

- [ ] **Step 3: Derive filter options and visible devices**

Derive sorted unique OS and profile options from `devices`, preserve currently selected valid values, pass filter state to `filterDevices`, and then call `sortDevices`. Pass `meta.partialFailures` to the table and notice components.

- [ ] **Step 4: Compose the page**

Render `DashboardHeader`, `SummaryMetrics`, `DeviceToolbar`, `Notice`, and `DeviceTable`. Render `DeviceDrawer` when `selectedDevice` is non-null. Display stale-cache and partial-failure notices using the existing Japanese messages from the legacy page, and use concise English labels for normal dashboard controls.

- [ ] **Step 5: Add cleanup and clipboard handling**

Clear the auto-refresh interval on component teardown. Implement clipboard copy with `navigator.clipboard.writeText`; show an error notice when unavailable or rejected, and a short success state on the clicked button.

- [ ] **Step 6: Run type checking**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the app wiring**

```bash
git add src/App.svelte
git commit -m "feat: wire svelte dashboard state"
```

### Task 4: Apply Skeleton-Based Styling and Entry Configuration

**Files:**
- Replace: `src/app.css`
- Modify: `src/client/index.html` only if title/root is incorrect
- Modify: `src/client/src/main.ts` only if it does not mount `src/App.svelte`

- [ ] **Step 1: Configure the global theme**

Import Tailwind/Skeleton styles required by the installed Skeleton version, define the app background and typography, and add only dashboard-specific layout rules. Do not copy the legacy 996-line stylesheet. Ensure light/dark color tokens have sufficient contrast.

- [ ] **Step 2: Add responsive layout rules**

Use a centered max-width page container, responsive metric grid, wrapping toolbar, horizontal table scrolling, and a full-width mobile drawer. Preserve usable keyboard focus styles and a minimum touch target for action buttons.

- [ ] **Step 3: Verify the Vite entrypoint**

Confirm `src/client/src/main.ts` mounts the root component and imports `src/app.css` through the root component. Confirm `src/client/index.html` has `<div id="app"></div>` and the dashboard title. Do not modify the existing Worker entry or Wrangler asset directory.

- [ ] **Step 4: Run the production build**

Run: `bun run build`

Expected: Vite emits the Svelte application into `dist` without unresolved imports.

- [ ] **Step 5: Commit styling and entrypoint changes**

```bash
git add src/app.css src/client/index.html src/client/src/main.ts
git commit -m "feat: style dashboard with skeleton"
```

### Task 5: Verify the Worker Integration and Dashboard Behavior

**Files:**
- Modify only files required by verification failures.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
bun test
bun run typecheck
bun run build
bun run dry-run
```

Expected: all commands exit successfully; `dry-run` must resolve the Worker entry and `dist` assets without changing Wrangler configuration.

- [ ] **Step 2: Start the development server**

Run: `bun run dev`

Expected: Vite builds the client and Wrangler serves the Worker without asset or API routing errors.

- [ ] **Step 3: Verify the primary user flows**

With a browser, verify initial loading, manual refresh, auto-refresh label, search, OS/status/profile filters, every sort mode, row keyboard activation, drawer open/close via button/backdrop/Escape, DNS/IP copy, stale/partial notices, and empty filter results.

- [ ] **Step 4: Verify responsive behavior**

Check a desktop viewport and a narrow mobile viewport. Confirm the toolbar remains usable, the table can scroll horizontally, the drawer fits the viewport, and focus indicators remain visible.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add src test public
git commit -m "fix: verify svelte dashboard integration"
```
