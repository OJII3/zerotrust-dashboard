export interface Env {
  ASSETS: Fetcher;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  REFRESH_INTERVAL_SECONDS?: string;
  RECENTLY_SEEN_THRESHOLD_SECONDS?: string;
  STALE_THRESHOLD_DAYS?: string;
  ENABLE_DEX?: string | boolean;
  CF_DNS_ZONE_ID?: string;
  ENABLE_DNS_SYNC?: string | boolean;
  DNS_BASE_DOMAIN?: string;
}

export function enabled(value?: string | boolean): boolean {
  return value === true || (typeof value === "string" && value.toLowerCase() === "true");
}

export function numberFromEnv(
  value: string | undefined,
  fallback: number,
  minimum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, minimum);
}
