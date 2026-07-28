import { enabled, numberFromEnv, type Env } from "./env";
import { fetchAllPages } from "./cloudflare-api";
import {
  fetchDeviceRegistrations,
  fetchPhysicalDevices,
  normalizeDevices,
  summarize,
  type DashboardDevice,
  type DexDevice
} from "./devices";
import type { AccessUser } from "./access";
import { computeHostnames, DEFAULT_DNS_BASE_DOMAIN } from "./dns";

interface CacheEntry {
  response: DevicesPayload;
  fetchedAt: number;
}

export interface DevicesPayload {
  devices: DashboardDevice[];
  summary: {
    devices: number;
    activeRegistrations: number;
    recentlySeen: number;
    staleDevices: number;
  };
  meta: {
    fetchedAt: string;
    cache: "hit" | "miss" | "stale";
    refreshIntervalSeconds: number;
    recentlySeenThresholdSeconds: number;
    staleThresholdDays: number;
    dexEnabled: boolean;
    dnsEnabled: boolean;
    partialFailures: string[];
  };
  viewer: AccessUser;
}

const cache = new Map<string, CacheEntry>();

export async function getDevicesPayload(env: Env, viewer: AccessUser, forceRefresh = false): Promise<DevicesPayload> {
  const ttlSeconds = numberFromEnv(env.REFRESH_INTERVAL_SECONDS, 60, 15);
  const cacheKey = env.CF_ACCOUNT_ID;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (!forceRefresh && cached && now - cached.fetchedAt < ttlSeconds * 1000) {
    return {
      ...cached.response,
      meta: {
        ...cached.response.meta,
        cache: "hit"
      },
      viewer
    };
  }

  const partialFailures: string[] = [];
  const [physicalResult, registrationResult, dexResult] = await Promise.allSettled([
    fetchPhysicalDevices(env),
    fetchDeviceRegistrations(env),
    enabled(env.ENABLE_DEX)
      ? fetchAllPages<DexDevice>(env, `/accounts/${env.CF_ACCOUNT_ID}/dex/fleet-status/devices`, {
          source: "last_seen"
        })
      : Promise.resolve([] as DexDevice[])
  ]);

  if (physicalResult.status === "rejected") {
    if (cached) {
      return {
        ...cached.response,
        meta: {
          ...cached.response.meta,
          cache: "stale",
          partialFailures: ["physical-devices"]
        },
        viewer
      };
    }
    throw physicalResult.reason;
  }

  const physicalDevices = physicalResult.value;
  const registrations = settledOrEmpty(registrationResult, "registrations", partialFailures);
  const dexDevices = settledOrEmpty(dexResult, "dex-fleet-status", partialFailures);

  const recentlySeenThresholdSeconds = numberFromEnv(env.RECENTLY_SEEN_THRESHOLD_SECONDS, 300, 1);
  const staleThresholdDays = numberFromEnv(env.STALE_THRESHOLD_DAYS, 30, 1);
  const devices = normalizeDevices(
    physicalDevices,
    registrations,
    dexDevices,
    recentlySeenThresholdSeconds,
    staleThresholdDays
  );

  const dnsEnabled = enabled(env.ENABLE_DNS_SYNC);
  if (dnsEnabled) {
    const hostnames = computeHostnames(devices, env.DNS_BASE_DOMAIN || DEFAULT_DNS_BASE_DOMAIN);
    for (const device of devices) {
      device.dnsHostname = hostnames.get(device.id)?.fqdn;
    }
  }

  const response: DevicesPayload = {
    devices,
    summary: summarize(devices),
    meta: {
      fetchedAt: new Date().toISOString(),
      cache: "miss",
      refreshIntervalSeconds: ttlSeconds,
      recentlySeenThresholdSeconds,
      staleThresholdDays,
      dexEnabled: enabled(env.ENABLE_DEX),
      dnsEnabled,
      partialFailures
    },
    viewer
  };

  cache.set(cacheKey, { response, fetchedAt: now });
  return response;
}

function settledOrEmpty<T>(result: PromiseSettledResult<T[]>, label: string, partialFailures: string[]): T[] {
  if (result.status === "fulfilled") return result.value;
  partialFailures.push(label);
  return [];
}
