<script lang="ts">
  import { onMount } from "svelte";
  import {
    activeCount,
    filterDevices,
    firstEmail,
    formatAbsolute,
    formatMaybeDate,
    osName,
    profileName,
    relativeTime,
    sortDevices,
    statusLabels,
    type Filters,
    type SortMode,
  } from "../../lib/dashboard";
  import type { DashboardDevice } from "../../server/devices";

  let devices: DashboardDevice[] = [];
  let summary = { devices: 0, activeRegistrations: 0, recentlySeen: 0, staleDevices: 0 };
  let meta: any = {};
  let viewer: any = null;
  let loading = false;
  let error = "";
  let filters: Filters = { query: "", os: "", status: "", profile: "" };
  let sort: SortMode = "default";
  let selected: DashboardDevice | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let copyMessage = "";

  $: visible = sortDevices(filterDevices(devices, filters), sort);
  $: osOptions = [...new Set(devices.map((d) => osName(d.deviceType || d.osVersion)))].sort();
  $: profileOptions = [
    ...new Set(devices.map((d) => profileName(d.profile)).filter(Boolean)),
  ].sort();
  $: notice =
    error ||
    (meta.cache === "stale"
      ? `最新情報を取得できないため、${meta.fetchedAt ? formatAbsolute(meta.fetchedAt) : ""} 時点のデータを表示しています。`
      : meta.partialFailures?.length
        ? `一部のAPI取得に失敗しました: ${meta.partialFailures.join(", ")}`
        : "");

  onMount(() => {
    load(false);
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  });
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") close();
  }
  async function load(manual: boolean) {
    if (loading) return;
    loading = true;
    error = "";
    try {
      const res = await fetch(`/api/devices${manual ? "?refresh=1" : ""}`, {
        headers: { Accept: "application/json" },
      });
      const body: any = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load devices");
      devices = body.devices || [];
      summary = body.summary;
      meta = body.meta || {};
      viewer = body.viewer;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(
        () => load(false),
        Math.max(Number(meta.refreshIntervalSeconds || 60), 15) * 1000,
      );
    } catch (e) {
      error =
        e instanceof Error && e.message !== "Failed to fetch"
          ? e.message
          : "Cloudflare APIから最新情報を取得できませんでした。";
    } finally {
      loading = false;
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copyMessage = "Copied";
      setTimeout(() => (copyMessage = ""), 900);
    } catch {
      error = "クリップボードへコピーできませんでした。";
    }
  }
  function close() {
    selected = null;
  }
</script>

<svelte:head><title>Zero Trust Machines</title></svelte:head>
<main class="app">
  <header class="header">
    <div>
      <p class="eyebrow">CLOUDFLARE ONE</p>
      <h1>Zero Trust Machines</h1>
      <p class="muted">{visible.length} devices in your fleet</p>
    </div>
    <div class="header-actions">
      <span class="muted">Signed in: {viewer?.email || viewer?.name || "Unknown"}</span><span
        class="muted"
        >{meta.fetchedAt ? `Updated ${formatAbsolute(meta.fetchedAt)}` : "Updated —"}</span
      ><button class="button primary" onclick={() => load(true)} disabled={loading}
        >{loading ? "Refreshing…" : "↻ Refresh"}</button
      >
    </div>
  </header>
  <section class="metrics" aria-label="Device summary">
    <div class="metric"><span>Devices</span><strong>{summary.devices}</strong></div>
    <div class="metric">
      <span>Active registrations</span><strong>{summary.activeRegistrations}</strong>
    </div>
    <div class="metric"><span>Recently seen</span><strong>{summary.recentlySeen}</strong></div>
    <div class="metric"><span>Stale devices</span><strong>{summary.staleDevices}</strong></div>
  </section>
  {#if notice}<div class="notice">{notice}</div>{/if}
  <section class="toolbar" aria-label="Filters">
    <input
      bind:value={filters.query}
      placeholder="Search hostname, user or IP..."
      aria-label="Search devices"
    /><select bind:value={filters.os} aria-label="Operating system"
      ><option value="">OS: All</option>{#each osOptions as value}<option>{value}</option
        >{/each}</select
    ><select bind:value={filters.status} aria-label="Status"
      ><option value="">Status: All</option>{#each Object.values(statusLabels) as value}<option
          >{value}</option
        >{/each}</select
    ><select bind:value={filters.profile} aria-label="Profile"
      ><option value="">Profile: All</option>{#each profileOptions as value}<option>{value}</option
        >{/each}</select
    ><select bind:value={sort} aria-label="Sort devices"
      ><option value="default">Default order</option><option value="name">Machine name</option
      ><option value="lastSeen">Last seen</option><option value="created">Created</option><option
        value="clientVersion">Client version</option
      ><option value="email">User email</option><option value="activeRegistrations"
        >Active registrations</option
      ></select
    >
  </section>
  <section class="table-card">
    <div class="table-scroll">
      <table>
        <thead><tr><th>Status</th><th>Machine</th><th>Addresses</th><th>Last seen</th></tr></thead
        ><tbody
          >{#each visible as device}<tr
              tabindex="0"
              onclick={() => (selected = device)}
              onkeydown={(e) => e.key === "Enter" && (selected = device)}
              ><td
                ><span class="status status-{device.status}">● {statusLabels[device.status]}</span
                ></td
              ><td
                ><strong>{device.name || "Unknown"}</strong>
                <div class="muted">
                  {firstEmail(device) || device.lastUser?.name || "Unknown user"}
                </div>
                <div class="muted">
                  {[osName(device.deviceType || device.osVersion), profileName(device.profile)]
                    .filter(Boolean)
                    .join(" · ")}
                </div></td
              ><td
                >{#if meta.partialFailures?.includes("registrations")}<span class="muted"
                    >Unavailable</span
                  >{:else}{#each device.registrations as registration}<div class="address">
                      <code>{registration.virtualIpv4 || registration.virtualIpv6 || "—"}</code
                      >{#if registration.virtualIpv4 || registration.virtualIpv6}<button
                          class="icon"
                          aria-label="Copy IP"
                          onclick={(e) => {
                            e.stopPropagation();
                            copy((registration.virtualIpv4 || registration.virtualIpv6)!);
                          }}>⧉</button
                        >{/if}
                    </div>{/each}{/if}</td
              ><td
                ><strong>{relativeTime(device.lastSeenAt)}</strong>
                <div class="muted">
                  {device.lastSeenAt ? formatAbsolute(device.lastSeenAt) : "Unknown"}
                </div></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if loading && !devices.length}<div class="empty">
        Loading devices…
      </div>{:else if !visible.length}<div class="empty">
        No devices match the current filters.
      </div>{/if}
  </section>
</main>

<svelte:window onkeydown={handleKeydown} />
{#if selected}<div
    class="backdrop"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && close()}
  >
    <div class="drawer" role="dialog" aria-label="Device details" aria-modal="true">
      <div class="drawer-head">
        <div>
          <p class="eyebrow">DEVICE DETAIL</p>
          <h2>{selected.name || "Unknown"}</h2>
          <p class="muted">{selected.id} · {statusLabels[selected.status]}</p>
        </div>
        <button class="icon" aria-label="Close details" onclick={close}>×</button>
      </div>
      <section>
        <h3>Basic information</h3>
        <dl>
          <dt>OS</dt>
          <dd>
            {[selected.deviceType, selected.osVersion, selected.osVersionExtra]
              .filter(Boolean)
              .join(" · ") || "—"}
          </dd>
          <dt>Client</dt>
          <dd>{selected.clientVersion || "—"}</dd>
          <dt>Manufacturer</dt>
          <dd>{selected.manufacturer || "—"}</dd>
          <dt>Model</dt>
          <dd>{selected.model || "—"}</dd>
          <dt>DNS hostname</dt>
          <dd>
            {selected.dnsHostname || "—"}
            {#if selected.dnsHostname}<button
                class="icon"
                onclick={() => copy(selected.dnsHostname!)}>⧉</button
              >{/if}
          </dd>
          <dt>Profile</dt>
          <dd>{profileName(selected.profile) || "—"}</dd>
          <dt>Created</dt>
          <dd>{formatMaybeDate(selected.createdAt)}</dd>
          <dt>Last seen</dt>
          <dd>{formatMaybeDate(selected.lastSeenAt)}</dd>
          <dt>Active registrations</dt>
          <dd>{activeCount(selected)}</dd>
        </dl>
      </section>
      <section>
        <h3>Registrations</h3>
        {#each selected.registrations as registration}<article class="registration">
            <div class="registration-head">
              <strong>{registration.id}</strong><span class="badge">{registration.status}</span>
            </div>
            <dl>
              <dt>User</dt>
              <dd>
                {[registration.user?.name, registration.user?.email].filter(Boolean).join(" · ") ||
                  "—"}
              </dd>
              <dt>IPv4</dt>
              <dd>
                <code>{registration.virtualIpv4 || "—"}</code>{#if registration.virtualIpv4}<button
                    class="icon"
                    onclick={() => copy(registration.virtualIpv4!)}>⧉</button
                  >{/if}
              </dd>
              <dt>IPv6</dt>
              <dd>
                <code>{registration.virtualIpv6 || "—"}</code>{#if registration.virtualIpv6}<button
                    class="icon"
                    onclick={() => copy(registration.virtualIpv6!)}>⧉</button
                  >{/if}
              </dd>
              <dt>Tunnel type</dt>
              <dd>{registration.tunnelType || "—"}</dd>
              <dt>Key type</dt>
              <dd>{registration.keyType || "—"}</dd>
              <dt>Created</dt>
              <dd>{formatMaybeDate(registration.createdAt)}</dd>
              <dt>Last seen</dt>
              <dd>{formatMaybeDate(registration.lastSeenAt)}</dd>
              <dt>Updated</dt>
              <dd>{formatMaybeDate(registration.updatedAt)}</dd>
              <dt>Revoked</dt>
              <dd>{formatMaybeDate(registration.revokedAt)}</dd>
              <dt>Profile</dt>
              <dd>{profileName(registration.profile) || "—"}</dd>
            </dl>
          </article>{/each}
      </section>
      {#if selected.dex}<section>
          <h3>DEX latest status</h3>
          <dl>
            <dt>Status</dt>
            <dd>{selected.dex.status || "—"}</dd>
            <dt>Timestamp</dt>
            <dd>{formatMaybeDate(selected.dex.timestamp)}</dd>
            <dt>Colo</dt>
            <dd>{selected.dex.colo || "—"}</dd>
            <dt>Mode</dt>
            <dd>{selected.dex.mode || "—"}</dd>
          </dl>
        </section>{/if}
    </div>
  </div>{/if}
{#if copyMessage}<div class="toast">{copyMessage}</div>{/if}
