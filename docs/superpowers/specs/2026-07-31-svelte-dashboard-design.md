# Svelte Dashboard Migration Design

## Goal

Migrate the existing single-page vanilla JavaScript dashboard to the existing Vite + Svelte setup. Preserve the dashboard's behavior and API contract, but replace the old HTML/CSS presentation with a new responsive Skeleton-based UI.

## Scope

The migration preserves:

- `/api/devices` loading and manual refresh with `?refresh=1`
- Automatic refresh based on `meta.refreshIntervalSeconds`
- Search, OS, status, profile, and sort controls
- Device summary metrics and viewer/update metadata
- Device detail drawer, registration details, and copy actions
- Partial failure, stale cache, and request error notices
- Responsive behavior and dark mode support through the new theme

The old visual styling and exact layout are not requirements.

## Architecture

`App.svelte` owns API loading, dashboard state, filter state, selected device state, and page composition. Presentational responsibilities are split into focused components:

```text
App
├── DashboardHeader
├── SummaryMetrics
├── DeviceToolbar
├── Notice
├── DeviceTable
│   └── DeviceRow
└── DeviceDrawer
    └── RegistrationCard
```

API response types and display helpers such as filtering, sorting, OS naming, status labels, badges, and date formatting live in TypeScript modules rather than inline HTML string rendering.

## Data Flow

On initial mount, `App.svelte` requests `/api/devices`. Manual refresh requests `/api/devices?refresh=1`. The response is stored as dashboard state and rendered reactively. Filtering and sorting operate on the fetched device list locally. Automatic refresh is cleared and recreated whenever the server-provided interval changes.

The selected device is passed to `DeviceDrawer`. Closing the drawer clears the selection. Background click, Escape, and the close button all close it.

## UI

The page uses Skeleton components and utility classes rather than reproducing the legacy CSS. The main view remains table-first:

- Header with title, count, viewer, update timestamp, and refresh action
- Four summary metric cards
- Search, three filters, and sort controls
- Scrollable responsive device table
- Right-side detail drawer, full-width on small screens
- Inline notice for warnings and request errors

Loading, refreshing, empty results, and error states are explicit. Existing data remains visible during background refresh.

## Error Handling

- Non-2xx responses show the server-provided error when available.
- Network and JSON parsing failures show a generic load failure notice.
- Stale cache data remains visible with a warning notice.
- Partial failures list the failed API sources.
- Clipboard failures show a copy failure notice instead of silently failing.

## Verification

Run `bun test`, `bun run typecheck`, `bun run build`, and `bun run dry-run`. Manually verify initial loading, refresh, automatic refresh, all filters, sorting, drawer open/close, copy actions, notices, empty results, and mobile layout in the development server.
