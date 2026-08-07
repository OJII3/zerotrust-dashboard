import type { Env } from "./env";
import { fetchAllPages } from "./cloudflare-api";

export interface PhysicalDevice {
  id: string;
  name?: string;
  device_type?: string;
  os_version?: string;
  os_version_extra?: string;
  client_version?: string;
  last_seen_at?: string;
  last_seen_user?: CloudflareUser;
  active_registrations?: number;
  manufacturer?: string;
  model?: string;
  created_at?: string;
  updated_at?: string;
  last_seen_registration?: {
    policy?: CloudflarePolicy;
  };
}

export interface DeviceRegistration {
  id: string;
  device?: {
    id?: string;
    name?: string;
    client_version?: string;
  };
  user?: CloudflareUser;
  virtual_ipv4?: string;
  virtual_ipv6?: string;
  tunnel_type?: string;
  key_type?: string;
  created_at?: string;
  last_seen_at?: string;
  updated_at?: string;
  revoked_at?: string | null;
  policy?: CloudflarePolicy;
}

export interface DexDevice {
  deviceId?: string;
  device_id?: string;
  status?: string;
  timestamp?: string;
  colo?: string;
  mode?: string;
  platform?: string;
  version?: string;
  connectionType?: string;
  connection_type?: string;
  tunnelType?: string;
  tunnel_type?: string;
}

export interface CloudflareUser {
  id?: string;
  name?: string;
  email?: string;
}

export interface CloudflarePolicy {
  id?: string;
  name?: string;
  deleted?: boolean;
}

export interface DashboardRegistration {
  id: string;
  user?: CloudflareUser;
  virtualIpv4?: string;
  virtualIpv6?: string;
  tunnelType?: string;
  keyType?: string;
  createdAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  revokedAt?: string | null;
  status: "active" | "revoked";
  profile?: DashboardProfile;
}

export interface DashboardProfile {
  id?: string;
  name?: string;
  deleted: boolean;
}

export interface DashboardDevice {
  id: string;
  name: string;
  deviceType?: string;
  osVersion?: string;
  osVersionExtra?: string;
  clientVersion?: string;
  status: "connected" | "recently_seen" | "offline" | "stale" | "revoked" | "unknown";
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
  manufacturer?: string;
  model?: string;
  lastUser?: CloudflareUser;
  profile?: DashboardProfile;
  registrations: DashboardRegistration[];
  dex?: {
    status?: string;
    timestamp?: string;
    colo?: string;
    mode?: string;
    connectionType?: string;
    tunnelType?: string;
  };
  dnsHostname?: string;
}

export function fetchPhysicalDevices(env: Env): Promise<PhysicalDevice[]> {
  return fetchAllPages<PhysicalDevice>(
    env,
    `/accounts/${env.CF_ACCOUNT_ID}/devices/physical-devices`,
  );
}

export function fetchDeviceRegistrations(env: Env): Promise<DeviceRegistration[]> {
  return fetchAllPages<DeviceRegistration>(
    env,
    `/accounts/${env.CF_ACCOUNT_ID}/devices/registrations`,
    {
      status: "all",
    },
  );
}

export function normalizeDevices(
  physicalDevices: PhysicalDevice[],
  registrations: DeviceRegistration[],
  dexDevices: DexDevice[],
  recentlySeenThresholdSeconds: number,
  staleThresholdDays: number,
): DashboardDevice[] {
  const registrationsByDevice = new Map<string, DeviceRegistration[]>();
  for (const registration of registrations) {
    const deviceId = registration.device?.id;
    if (!deviceId) continue;
    const list = registrationsByDevice.get(deviceId) ?? [];
    list.push(registration);
    registrationsByDevice.set(deviceId, list);
  }

  const dexByDevice = new Map<string, DexDevice>();
  for (const dex of dexDevices) {
    const deviceId = dex.deviceId ?? dex.device_id;
    if (deviceId) dexByDevice.set(deviceId, dex);
  }

  return physicalDevices.map((device) => {
    const deviceRegistrations = registrationsByDevice.get(device.id) ?? [];
    const normalizedRegistrations = deviceRegistrations.map(normalizeRegistration);
    const dex = dexByDevice.get(device.id);
    const lastSeenAt = latestDate([
      device.last_seen_at,
      ...normalizedRegistrations.map((registration) => registration.lastSeenAt),
      dex?.timestamp,
    ]);

    return {
      id: device.id,
      name: device.name || "Unknown",
      deviceType: device.device_type,
      osVersion: device.os_version,
      osVersionExtra: device.os_version_extra,
      clientVersion: device.client_version,
      status: deriveStatus(
        dex,
        lastSeenAt,
        normalizedRegistrations,
        recentlySeenThresholdSeconds,
        staleThresholdDays,
      ),
      lastSeenAt,
      createdAt: device.created_at || "",
      updatedAt: device.updated_at || "",
      manufacturer: device.manufacturer,
      model: device.model,
      lastUser: sanitizeUser(device.last_seen_user),
      profile: normalizeProfile(device.last_seen_registration?.policy),
      registrations: normalizedRegistrations,
      dex: dex
        ? {
            status: dex.status,
            timestamp: dex.timestamp,
            colo: dex.colo,
            mode: dex.mode,
            connectionType: dex.connectionType ?? dex.connection_type,
            tunnelType: dex.tunnelType ?? dex.tunnel_type,
          }
        : undefined,
    };
  });
}

function normalizeRegistration(registration: DeviceRegistration): DashboardRegistration {
  return {
    id: registration.id,
    user: sanitizeUser(registration.user),
    virtualIpv4: registration.virtual_ipv4,
    virtualIpv6: registration.virtual_ipv6,
    tunnelType: registration.tunnel_type,
    keyType: registration.key_type,
    createdAt: registration.created_at,
    lastSeenAt: registration.last_seen_at,
    updatedAt: registration.updated_at,
    revokedAt: registration.revoked_at,
    status: registration.revoked_at ? "revoked" : "active",
    profile: normalizeProfile(registration.policy),
  };
}

function normalizeProfile(policy?: CloudflarePolicy): DashboardProfile | undefined {
  if (!policy) return undefined;
  return {
    id: policy.id,
    name: policy.name,
    deleted: Boolean(policy.deleted),
  };
}

function sanitizeUser(user?: CloudflareUser): CloudflareUser | undefined {
  if (!user) return undefined;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function deriveStatus(
  dex: DexDevice | undefined,
  lastSeenAt: string | undefined,
  registrations: DashboardRegistration[],
  recentlySeenThresholdSeconds: number,
  staleThresholdDays: number,
): DashboardDevice["status"] {
  if (dex?.status) {
    const status = dex.status.toLowerCase();
    if (status === "connected") return "connected";
    if (status === "disconnected" || status === "offline") return "offline";
  }

  const hasActive = registrations.some((registration) => registration.status === "active");
  if (!hasActive && registrations.length > 0) return "revoked";
  if (!lastSeenAt) return "unknown";

  const ageMs = Date.now() - Date.parse(lastSeenAt);
  if (ageMs >= staleThresholdDays * 24 * 60 * 60 * 1000) return "stale";
  if (ageMs <= recentlySeenThresholdSeconds * 1000) return "recently_seen";
  return "offline";
}

export function summarize(devices: DashboardDevice[]) {
  return {
    devices: devices.length,
    activeRegistrations: devices.reduce(
      (total, device) =>
        total +
        device.registrations.filter((registration) => registration.status === "active").length,
      0,
    ),
    recentlySeen: devices.filter(
      (device) => device.status === "connected" || device.status === "recently_seen",
    ).length,
    staleDevices: devices.filter((device) => device.status === "stale").length,
  };
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}
