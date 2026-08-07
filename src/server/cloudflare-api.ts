import type { Env } from "./env";

export const API_BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareListResponse<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T[];
  result_info?: {
    cursor?: string;
    cursors?: {
      after?: string;
    };
    page?: number;
    per_page?: number;
    count?: number;
    total_count?: number;
  };
}

export interface CloudflareSingleResponse<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

export async function fetchAllPages<T>(
  env: Env,
  path: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (cursor) url.searchParams.set("cursor", cursor);

    const body = await cfFetch<CloudflareListResponse<T>>(env, "GET", url, path);

    results.push(...(body.result ?? []));
    cursor = body.result_info?.cursor ?? body.result_info?.cursors?.after;
  } while (cursor);

  return results;
}

export async function fetchAllDnsRecords(
  env: Env,
  zoneId: string,
  params: Record<string, string> = {},
): Promise<DnsRecord[]> {
  const results: DnsRecord[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const path = `/zones/${zoneId}/dns_records`;
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const body = await cfFetch<CloudflareListResponse<DnsRecord>>(env, "GET", url, path);
    results.push(...(body.result ?? []));

    const totalCount = body.result_info?.total_count ?? results.length;
    if (page * perPage >= totalCount || !body.result?.length) break;
    page += 1;
  }

  return results;
}

export async function createDnsRecord(
  env: Env,
  zoneId: string,
  record: { type: string; name: string; content: string; ttl: number; proxied: boolean },
): Promise<DnsRecord> {
  const path = `/zones/${zoneId}/dns_records`;
  const body = await cfFetch<CloudflareSingleResponse<DnsRecord>>(
    env,
    "POST",
    new URL(`${API_BASE}${path}`),
    path,
    record,
  );
  if (!body.result) throw new Error(`${path} succeeded without a result`);
  return body.result;
}

export async function updateDnsRecord(
  env: Env,
  zoneId: string,
  recordId: string,
  patch: { content: string },
): Promise<DnsRecord> {
  const path = `/zones/${zoneId}/dns_records/${recordId}`;
  const body = await cfFetch<CloudflareSingleResponse<DnsRecord>>(
    env,
    "PATCH",
    new URL(`${API_BASE}${path}`),
    path,
    patch,
  );
  if (!body.result) throw new Error(`${path} succeeded without a result`);
  return body.result;
}

export async function deleteDnsRecord(env: Env, zoneId: string, recordId: string): Promise<void> {
  const path = `/zones/${zoneId}/dns_records/${recordId}`;
  await cfFetch<CloudflareSingleResponse<{ id: string }>>(
    env,
    "DELETE",
    new URL(`${API_BASE}${path}`),
    path,
  );
}

async function cfFetch<
  T extends { success: boolean; errors?: Array<{ code?: number; message?: string }> },
>(env: Env, method: string, url: URL, logPath: string, jsonBody?: unknown): Promise<T> {
  const started = Date.now();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      Accept: "application/json",
      ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });

  console.log("cloudflare_api_request", {
    method,
    path: logPath,
    status: response.status,
    durationMs: Date.now() - started,
  });

  const body = (await response.json()) as T;
  if (!response.ok || !body.success) {
    throw new Error(apiErrorMessage(logPath, response.status, body));
  }

  return body;
}

export function apiErrorMessage(
  path: string,
  status: number,
  body: { errors?: Array<{ code?: number; message?: string }> },
): string {
  const message = body.errors
    ?.map((error) => `${error.code ?? "unknown"} ${error.message ?? ""}`.trim())
    .join("; ");
  return `${path} failed with HTTP ${status}${message ? `: ${message}` : ""}`;
}

export function serializeLogError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}
