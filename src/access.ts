import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";
import { serializeLogError } from "./cloudflare-api";

export interface AccessUser {
  email?: string;
  name?: string;
  sub?: string;
}

export interface AccessVerificationResult {
  viewer: AccessUser | null;
  reason?: "missing_header" | "missing_config" | "jwt_verify_failed";
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccessJwt(request: Request, env: Env): Promise<AccessVerificationResult> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { viewer: null, reason: "missing_header" };

  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    return { viewer: null, reason: "missing_config" };
  }

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
      viewer: {
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
        sub: typeof payload.sub === "string" ? payload.sub : undefined
      }
    };
  } catch (error) {
    console.error("access_jwt_verification_failed", serializeLogError(error));
    return { viewer: null, reason: "jwt_verify_failed" };
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

function normalizeTeamDomain(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
