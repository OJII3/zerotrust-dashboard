import { enabled, type Env } from "./env";
import { createDnsRecord, deleteDnsRecord, fetchAllDnsRecords, serializeLogError, updateDnsRecord } from "./cloudflare-api";
import type { DashboardDevice } from "./devices";

export const DEFAULT_DNS_BASE_DOMAIN = "internal.ojii3.dev";

const MAX_LABEL_LENGTH = 63;
const COLLISION_SUFFIX_LENGTH = 9; // "-" + 8 hex chars of the device id
const DNS_TTL_SECONDS = 300;

export interface DnsTarget {
  fqdn: string;
  ipv4: string;
}

export function slugifyLabel(input: string): string {
  const withoutDiacritics = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "device";
}

export function computeHostnames(devices: DashboardDevice[], baseDomain: string): Map<string, DnsTarget> {
  const targets = new Map<string, { device: DashboardDevice; ipv4: string }>();
  for (const device of devices) {
    const ipv4 = pickTargetIpv4(device);
    if (ipv4) targets.set(device.id, { device, ipv4 });
  }

  const labelGroups = new Map<string, string[]>();
  for (const [deviceId, { device }] of targets) {
    const slug = slugifyLabel(device.name).slice(0, MAX_LABEL_LENGTH);
    const group = labelGroups.get(slug) ?? [];
    group.push(deviceId);
    labelGroups.set(slug, group);
  }

  const result = new Map<string, DnsTarget>();
  for (const [slug, deviceIds] of labelGroups) {
    const needsSuffix = deviceIds.length > 1;
    for (const deviceId of deviceIds) {
      const target = targets.get(deviceId);
      if (!target) continue;
      const label = needsSuffix
        ? `${slug.slice(0, MAX_LABEL_LENGTH - COLLISION_SUFFIX_LENGTH)}-${deviceId.slice(0, 8)}`
        : slug;
      result.set(deviceId, { fqdn: `${label}.${baseDomain}`, ipv4: target.ipv4 });
    }
  }

  return result;
}

function pickTargetIpv4(device: DashboardDevice): string | undefined {
  const active = device.registrations.filter(
    (registration) => registration.status === "active" && registration.virtualIpv4
  );
  if (!active.length) return undefined;

  const latest = [...active].sort(
    (a, b) => Date.parse(b.lastSeenAt ?? "") - Date.parse(a.lastSeenAt ?? "")
  )[0];
  return latest.virtualIpv4;
}

export async function reconcileDns(env: Env, devices: DashboardDevice[]): Promise<void> {
  if (!enabled(env.ENABLE_DNS_SYNC)) {
    console.log("dns_reconcile_skipped", { reason: "disabled" });
    return;
  }

  const zoneId = env.CF_DNS_ZONE_ID;
  if (!zoneId) {
    console.error("dns_reconcile_skipped", { reason: "missing_zone_id" });
    return;
  }

  const baseDomain = env.DNS_BASE_DOMAIN || DEFAULT_DNS_BASE_DOMAIN;
  const desired = computeHostnames(devices, baseDomain);

  try {
    const existing = await fetchAllDnsRecords(env, zoneId, { type: "A" });
    const managed = existing.filter((record) => record.name.toLowerCase().endsWith(`.${baseDomain.toLowerCase()}`));
    const managedByName = new Map(managed.map((record) => [record.name.toLowerCase(), record]));

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let unchanged = 0;

    const desiredNames = new Set<string>();
    for (const { fqdn, ipv4 } of desired.values()) {
      const key = fqdn.toLowerCase();
      desiredNames.add(key);
      const existingRecord = managedByName.get(key);

      if (!existingRecord) {
        await createDnsRecord(env, zoneId, { type: "A", name: fqdn, content: ipv4, ttl: DNS_TTL_SECONDS, proxied: false });
        created += 1;
      } else if (existingRecord.content !== ipv4) {
        await updateDnsRecord(env, zoneId, existingRecord.id, { content: ipv4 });
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    for (const record of managed) {
      if (!desiredNames.has(record.name.toLowerCase())) {
        await deleteDnsRecord(env, zoneId, record.id);
        deleted += 1;
      }
    }

    console.log("dns_reconcile", { created, updated, deleted, unchanged });
  } catch (error) {
    console.error("dns_reconcile_failed", serializeLogError(error));
    throw error;
  }
}
