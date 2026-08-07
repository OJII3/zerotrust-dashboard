const statusLabels = {
  connected: "Connected",
  recently_seen: "Recently seen",
  offline: "Offline",
  stale: "Stale",
  revoked: "Revoked",
  unknown: "Unknown",
};

export function statusHtml(status) {
  const label = statusLabels[status] || "Unknown";
  return `<span class="dot status-${escapeHtml(status)}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></span>`;
}

export function addressesHtml(registrations, unavailable = false) {
  const addresses = registrations.map((registration) => registration.virtualIpv4).filter(Boolean);

  if (!addresses.length) {
    if (unavailable) return `<span class="subtle">Unavailable</span>`;
    return `<span class="subtle">—</span>`;
  }

  return (
    addresses.slice(0, 4).map(addrRow).join("") +
    (addresses.length > 4 ? `<div class="subtle">${addresses.length - 4} more addresses</div>` : "")
  );
}

function addrRow(address) {
  return `
    <div class="addr">
      <code title="${escapeHtml(address)}">${escapeHtml(address)}</code>
      <button class="copy-btn" type="button" data-copy="${escapeHtml(address)}" aria-label="Copy ${escapeHtml(address)}">⧉</button>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
