import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { env as cfEnv } from "cloudflare:workers";
import { numberFromEnv, type Env } from "./env";
import { serializeLogError } from "./cloudflare-api";
import { verifyAccessJwt } from "./access";
import { fetchDeviceRegistrations, fetchPhysicalDevices, normalizeDevices } from "./devices";
import { getDevicesPayload } from "./dashboard";
import { reconcileDns } from "./dns";

const app = new Elysia({ adapter: CloudflareAdapter })
  .get("/api/devices", async ({ request, query, set }) => {
    const env = cfEnv as unknown as Env;
    const { viewer, reason } = await verifyAccessJwt(request, env);
    if (!viewer) {
      console.warn("access_jwt_unauthorized", { reason });
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
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })
  .all("/api/*", ({ set }) => {
    set.status = 404;
    return { error: "Not found" };
  })
  .get("*", ({ request }) => (cfEnv as unknown as Env).ASSETS.fetch(request))
  .compile();

async function scheduled(): Promise<void> {
  const env = cfEnv as unknown as Env;
  const [physicalDevices, registrations] = await Promise.all([
    fetchPhysicalDevices(env),
    fetchDeviceRegistrations(env),
  ]);

  const recentlySeenThresholdSeconds = numberFromEnv(env.RECENTLY_SEEN_THRESHOLD_SECONDS, 300, 1);
  const staleThresholdDays = numberFromEnv(env.STALE_THRESHOLD_DAYS, 30, 1);
  const devices = normalizeDevices(
    physicalDevices,
    registrations,
    [],
    recentlySeenThresholdSeconds,
    staleThresholdDays,
  );

  await reconcileDns(env, devices);
}

export default { fetch: app.fetch, scheduled };
