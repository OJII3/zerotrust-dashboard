import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { env as cfEnv } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  ASSETS: Fetcher;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  REFRESH_INTERVAL_SECONDS?: string;
  RECENTLY_SEEN_THRESHOLD_SECONDS?: string;
  STALE_THRESHOLD_DAYS?: string;
  ENABLE_DEX?: string;
}

interface AccessUser {
  email?: string;
  name?: string;
  sub?: string;
}

interface CloudflareListResponse<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T[];
  result_info?: {
    cursor?: string;
    cursors?: {
      after?: string;
    };
  };
}

interface PhysicalDevice {
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

interface DeviceRegistration {
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

interface DexDevice {
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

interface CloudflareUser {
  id?: string;
  name?: string;
  email?: string;
}

interface CloudflarePolicy {
  id?: string;
  name?: string;
  deleted?: boolean;
}

interface DashboardRegistration {
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

interface DashboardProfile {
  id?: string;
  name?: string;
  deleted: boolean;
}

interface DashboardDevice {
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
}

interface CacheEntry {
  response: DevicesPayload;
  fetchedAt: number;
}

interface DevicesPayload {
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
    partialFailures: string[];
  };
  viewer: AccessUser;
}

const API_BASE = "https://api.cloudflare.com/client/v4";
const cache = new Map<string, CacheEntry>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const app = new Elysia({ adapter: CloudflareAdapter })
  .get("/api/devices", async ({ request, query, set }) => {
    const env = cfEnv as unknown as Env;
    const viewer = await verifyAccessJwt(request, env);
    if (!viewer) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    try {
      return await getDevicesPayload(env, viewer, query.refresh === "1");
    } catch (error) {
      console.error("cloudflare_api_error", serializeLogError(error));
      set.status = 502;
      return {
        error: "Cloudflare APIから最新情報を取得できませんでした。",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  })
  .all("/api/*", ({ set }) => {
    set.status = 404;
    return { error: "Not found" };
  })
  .get("*", ({ request }) => (cfEnv as unknown as Env).ASSETS.fetch(request))
  .compile();

export default app;

async function verifyAccessJwt(request: Request, env: Env): Promise<AccessUser | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const issuer = `https://${teamDomain}`;
  const jwksUrl = new URL(`${issuer}/cdn-cgi/access/certs`);
  const jwks = getJwks(jwksUrl);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.CF_ACCESS_AUD
    });

    return {
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      sub: typeof payload.sub === "string" ? payload.sub : undefined
    };
  } catch (error) {
    console.error("access_jwt_verification_failed", serializeLogError(error));
    return null;
  }
}

function getJwks(url: URL) {
  const key = url.toString();
  const existing = jwksCache.get(key);
  if (existing) return existing;

  const jwks = createRemoteJWKSet(url);
  jwksCache.set(key, jwks);
  return jwks;
}

async function getDevicesPayload(env: Env, viewer: AccessUser, forceRefresh = false): Promise<DevicesPayload> {
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
    fetchAllPages<PhysicalDevice>(env, `/accounts/${env.CF_ACCOUNT_ID}/devices/physical-devices`),
    fetchAllPages<DeviceRegistration>(env, `/accounts/${env.CF_ACCOUNT_ID}/devices/registrations`, {
      status: "all"
    }),
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
      partialFailures
    },
    viewer
  };

  cache.set(cacheKey, { response, fetchedAt: now });
  return response;
}

async function fetchAllPages<T>(
  env: Env,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (cursor) url.searchParams.set("cursor", cursor);

    const started = Date.now();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        Accept: "application/json"
      }
    });

    console.log("cloudflare_api_get", {
      path,
      status: response.status,
      durationMs: Date.now() - started
    });

    const body = (await response.json()) as CloudflareListResponse<T>;
    if (!response.ok || !body.success) {
      throw new Error(apiErrorMessage(path, response.status, body));
    }

    results.push(...(body.result ?? []));
    cursor = body.result_info?.cursor ?? body.result_info?.cursors?.after;
  } while (cursor);

  return results;
}

function normalizeDevices(
  physicalDevices: PhysicalDevice[],
  registrations: DeviceRegistration[],
  dexDevices: DexDevice[],
  recentlySeenThresholdSeconds: number,
  staleThresholdDays: number
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
      dex?.timestamp
    ]);

    return {
      id: device.id,
      name: device.name || "Unknown",
      deviceType: device.device_type,
      osVersion: device.os_version,
      osVersionExtra: device.os_version_extra,
      clientVersion: device.client_version,
      status: deriveStatus(dex, lastSeenAt, normalizedRegistrations, recentlySeenThresholdSeconds, staleThresholdDays),
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
            tunnelType: dex.tunnelType ?? dex.tunnel_type
          }
        : undefined
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
    profile: normalizeProfile(registration.policy)
  };
}

function normalizeProfile(policy?: CloudflarePolicy): DashboardProfile | undefined {
  if (!policy) return undefined;
  return {
    id: policy.id,
    name: policy.name,
    deleted: Boolean(policy.deleted)
  };
}

function sanitizeUser(user?: CloudflareUser): CloudflareUser | undefined {
  if (!user) return undefined;
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

function deriveStatus(
  dex: DexDevice | undefined,
  lastSeenAt: string | undefined,
  registrations: DashboardRegistration[],
  recentlySeenThresholdSeconds: number,
  staleThresholdDays: number
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

function summarize(devices: DashboardDevice[]) {
  return {
    devices: devices.length,
    activeRegistrations: devices.reduce(
      (total, device) => total + device.registrations.filter((registration) => registration.status === "active").length,
      0
    ),
    recentlySeen: devices.filter((device) => device.status === "connected" || device.status === "recently_seen").length,
    staleDevices: devices.filter((device) => device.status === "stale").length
  };
}

function settledOrEmpty<T>(
  result: PromiseSettledResult<T[]>,
  label: string,
  partialFailures: string[]
): T[] {
  if (result.status === "fulfilled") return result.value;
  partialFailures.push(label);
  return [];
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function apiErrorMessage<T>(path: string, status: number, body: CloudflareListResponse<T>): string {
  const message = body.errors?.map((error) => `${error.code ?? "unknown"} ${error.message ?? ""}`.trim()).join("; ");
  return `${path} failed with HTTP ${status}${message ? `: ${message}` : ""}`;
}

function normalizeTeamDomain(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function enabled(value?: string): boolean {
  return value?.toLowerCase() === "true";
}

function numberFromEnv(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, minimum);
}

function serializeLogError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}
