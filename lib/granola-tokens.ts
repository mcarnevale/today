// ── GRANOLA TOKEN STORAGE ──
// Stores OAuth tokens per user. Uses Upstash Redis (Vercel KV) when configured.
// Fallback: env vars GRANOLA_ACCESS_TOKEN, GRANOLA_REFRESH_TOKEN for single-user.

const KV_PREFIX = 'granola:';

export interface GranolaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix ms
  client_id?: string; // For token refresh
}

function getRedis() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // Dynamic import to avoid loading Redis when not configured
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

export async function getGranolaTokens(userId: string): Promise<GranolaTokens | null> {
  // Env fallback for single-user (no KV)
  const access = process.env.GRANOLA_ACCESS_TOKEN;
  const refresh = process.env.GRANOLA_REFRESH_TOKEN;
  const expires = process.env.GRANOLA_TOKEN_EXPIRES_AT;
  if (access && refresh) {
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: expires ? parseInt(expires, 10) : Date.now() + 3600_000,
    };
  }

  const redis = getRedis();
  if (!redis) return null;

  const key = `${KV_PREFIX}${userId}`;
  const raw = await redis.get(key);
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (
    typeof t.access_token === 'string' &&
    typeof t.refresh_token === 'string' &&
    typeof t.expires_at === 'number'
  ) {
    return {
      ...t,
      client_id: typeof t.client_id === 'string' ? t.client_id : undefined,
    } as GranolaTokens;
  }
  return null;
}

export async function setGranolaTokens(
  userId: string,
  tokens: GranolaTokens
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[granola] No KV configured — tokens not persisted. Add KV_REST_API_URL/TOKEN or use env vars.');
    return;
  }
  const key = `${KV_PREFIX}${userId}`;
  await redis.set(key, JSON.stringify(tokens), { ex: 60 * 60 * 24 * 30 }); // 30 days TTL
}

export async function deleteGranolaTokens(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`${KV_PREFIX}${userId}`);
}

// OAuth state (codeVerifier, clientId) — short-lived, for connect flow
const OAUTH_STATE_PREFIX = 'granola:oauth:';

export interface OAuthStateData {
  codeVerifier: string;
  userId: string;
  clientId: string;
}

export async function setOAuthState(
  state: string,
  data: OAuthStateData
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('KV required for Granola OAuth');
  await redis.set(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify(data), {
    ex: 600, // 10 min
  });
}

export async function getOAuthState(state: string): Promise<OAuthStateData | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(`${OAUTH_STATE_PREFIX}${state}`);
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (
    typeof d.codeVerifier === 'string' &&
    typeof d.userId === 'string' &&
    typeof d.clientId === 'string'
  ) {
    return { codeVerifier: d.codeVerifier, userId: d.userId, clientId: d.clientId };
  }
  return null;
}

export async function deleteOAuthState(state: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`${OAUTH_STATE_PREFIX}${state}`);
}
