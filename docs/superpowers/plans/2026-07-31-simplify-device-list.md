# Simplify Device List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the device list to four compact columns that fit phone viewports while keeping complete device data in the details drawer.

**Architecture:** Keep the existing single-page dashboard and table structure in `public/index.html`. Change only list-specific markup, render helpers, and responsive CSS; preserve the API payload, filtering, sorting, and drawer rendering. Add a Bun regression test that inspects the shipped HTML so the list/detail boundary and responsive contract remain explicit.

**Tech Stack:** Static HTML/CSS/JavaScript, Bun test runner, TypeScript, Cloudflare Workers/Wrangler

**Execution note:** During pre-implementation review, the source-text
regression tests below were replaced with behavioral tests for an extracted
`public/dashboard-renderers.js` module. This avoids coupling tests to function
source formatting while exercising the exact renderer shipped to browsers.

## Global Constraints

- The list contains exactly Status, Machine, Addresses, and Last Seen columns.
- Status is a colored dot only, with an accessible status name and pointer tooltip.
- List addresses include WARP virtual IPv4 only; DNS hostnames and IPv6 remain in the details drawer.
- The Version list column is removed; client version remains searchable, sortable, and visible in the details drawer.
- At viewport widths up to 1023px, the list fits normal phone widths without a fixed table minimum width or horizontal scrolling.
- Filters, row selection, refresh behavior, summary metrics, API responses, and details content remain unchanged.

---

### Task 1: Simplify and make the device list responsive

**Files:**
- Create: `test/dashboard-html.test.ts`
- Modify: `package.json`
- Modify: `public/index.html:183-241`
- Modify: `public/index.html:419-451`
- Modify: `public/index.html:509-522`
- Modify: `public/index.html:668-683`
- Modify: `public/index.html:740-799`

**Interfaces:**
- Consumes: the existing `DashboardDevice` JSON shape, including `status`, `registrations[].virtualIpv4`, `dnsHostname`, `clientVersion`, and `lastSeenAt`.
- Produces: `statusHtml(device)` returning one accessible status dot; `addressesHtml(device)` returning up to four IPv4 address rows; a four-cell table row ordered Status, Machine, Addresses, Last Seen.

- [ ] **Step 1: Add the Bun test command and failing HTML contract tests**

Add the following script to `package.json`:

```json
"test": "bun test"
```

Create `test/dashboard-html.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

const html = await Bun.file(new URL("../public/index.html", import.meta.url)).text();

function section(start: string, end: string): string {
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return html.slice(startIndex, endIndex);
}

describe("device list HTML", () => {
  test("contains only the four list columns", () => {
    const tableHead = section("<thead>", "</thead>");
    expect(tableHead.match(/<th\b/g)).toHaveLength(4);
    expect(tableHead).toContain('<th class="status-cell">Status</th>');
    expect(tableHead).toContain('<th class="machine-cell">Machine</th>');
    expect(tableHead).toContain('<th class="address-cell">Addresses</th>');
    expect(tableHead).toContain('<th class="last-seen-cell">Last Seen</th>');
    expect(tableHead).not.toContain("Version");

    const rowTemplate = section("row.innerHTML = `", "`;");
    expect(rowTemplate.match(/<td>/g)).toHaveLength(4);
    expect(rowTemplate).not.toContain("versionHtml(device)");
  });

  test("renders status as one accessible dot", () => {
    const statusRenderer = section(
      "function statusHtml(device)",
      "function machineHtml(device)"
    );
    expect(statusRenderer).toContain('class="dot status-${escapeHtml(device.status)}"');
    expect(statusRenderer).toContain('role="img"');
    expect(statusRenderer).toContain('aria-label="${escapeHtml(label)}"');
    expect(statusRenderer).toContain('title="${escapeHtml(label)}"');
    expect(statusRenderer).not.toContain("status-label");
    expect(statusRenderer).not.toContain("<div");
  });

  test("renders only IPv4 addresses in the list", () => {
    const addressRenderer = section(
      "function addressesHtml(device)",
      "function addrRow(address)"
    );
    expect(addressRenderer).toContain("registration.virtualIpv4");
    expect(addressRenderer).not.toContain("virtualIpv6");
    expect(addressRenderer).not.toContain("dnsHostname");
    expect(addressRenderer).toContain('partialFailures?.includes("registrations")');
  });

  test("keeps DNS, IPv6, and client version in details and search", () => {
    const drawer = section("function openDrawer(device)", "function closeDrawer()");
    const registration = section(
      "function registrationHtml(registration)",
      "function kv(entries)"
    );
    const search = section("function searchBlob(device)", "function firstEmail(device)");

    expect(drawer).toContain('"DNS hostname"');
    expect(drawer).toContain('"Cloudflare One Client": device.clientVersion');
    expect(registration).toContain("IPv6: copyable(registration.virtualIpv6)");
    expect(search).toContain("device.dnsHostname");
    expect(search).toContain("device.clientVersion");
    expect(search).toContain("registration.virtualIpv6");
    expect(html).toContain('<option value="clientVersion">Client version</option>');
  });

  test("removes the mobile fixed-width horizontal scroller", () => {
    const responsiveCss = section(
      "@media (max-width: 1023px)",
      "</style>"
    );
    expect(responsiveCss).not.toContain("min-width: 980px");
    expect(responsiveCss).not.toContain("overflow-x: auto");
    expect(responsiveCss).toContain(".status-cell");
    expect(responsiveCss).toContain(".copy-btn");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bun test test/dashboard-html.test.ts
```

Expected: four tests fail with list-contract mismatches, including five
headers/cells, visible status text, DNS/IPv6 address references, and
`min-width: 980px`. The details-and-search preservation test already passes.

- [ ] **Step 3: Implement the minimal list markup and render changes**

In `public/index.html`:

1. Remove the Version `<th>` and the `${versionHtml(device)}` `<td>`.
2. Delete the `.version-cell` CSS rule and the `versionHtml(device)` function.
3. Replace `statusHtml` with:

```js
function statusHtml(device) {
  const label = statusLabels[device.status] || "Unknown";
  return `<span
    class="dot status-${escapeHtml(device.status)}"
    role="img"
    aria-label="${escapeHtml(label)}"
    title="${escapeHtml(label)}"
  ></span>`;
}
```

4. Replace the address selection in `addressesHtml` with IPv4-only data:

```js
const addresses = device.registrations
  .map((registration) => registration.virtualIpv4)
  .filter(Boolean);

if (!addresses.length) {
  if (state.meta?.partialFailures?.includes("registrations")) {
    return `<span class="subtle">Unavailable</span>`;
  }
  return `<span class="subtle">—</span>`;
}

return addresses.slice(0, 4).map(addrRow).join("")
  + (addresses.length > 4
    ? `<div class="subtle">${addresses.length - 4} more addresses</div>`
    : "");
```

Do not change `openDrawer`, `registrationHtml`, `searchBlob`, the client-version sort option, or the API data types.

- [ ] **Step 4: Implement compact desktop and mobile CSS**

Update the base column widths and alignment:

```css
.status-cell {
  width: 64px;
  text-align: center;
}

td:first-child {
  text-align: center;
}

.machine-cell {
  width: 34%;
}

.address-cell {
  width: 32%;
}

.last-seen-cell {
  width: 26%;
}
```

Remove the `.status-label` rule because the status cell no longer renders it.

Replace the mobile `.table-wrap` and `table` rules inside
`@media (max-width: 1023px)` with:

```css
.table-wrap {
  overflow: hidden;
}

th,
td {
  padding: 10px 6px;
}

.status-cell {
  width: 36px;
}

.machine-cell {
  width: 34%;
}

.address-cell {
  width: 34%;
}

.last-seen-cell {
  width: 24%;
}

.addr {
  grid-template-columns: minmax(0, 1fr) 26px;
  gap: 4px;
}

.copy-btn {
  width: 26px;
  min-height: 28px;
}
```

Keep `table-layout: fixed` and the existing truncation rules so long content
does not force the table wider than its container.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
bun test test/dashboard-html.test.ts
```

Expected: `5 pass`, `0 fail`.

- [ ] **Step 6: Run project verification**

Run:

```bash
bun run typecheck
bun run dry-run
git diff --check
```

Expected: TypeScript exits successfully, Wrangler dry-run completes without
deployment, and `git diff --check` produces no output.

- [ ] **Step 7: Review the responsive result in a browser**

Run:

```bash
bun run dev
```

At desktop width and a 390px viewport, verify:

- The table has four columns and no horizontal scrollbar.
- Status cells show only colored dots; each dot exposes its label in the
  accessibility tree and as a tooltip.
- Address cells show IPv4 only and retain working copy buttons.
- Selecting a row opens the drawer with DNS hostname, IPv6, OS version, and
  client version.
- Client-version sorting and searches for DNS, IPv6, and client version still
  work.

- [ ] **Step 8: Commit the implementation**

```bash
git add package.json public/index.html test/dashboard-html.test.ts
git commit -m "feat: simplify device list"
```
