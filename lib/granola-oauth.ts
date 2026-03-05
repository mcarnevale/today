// ── GRANOLA MCP OAUTH ──
// OAuth 2.0 + PKCE + Dynamic Client Registration for mcp.granola.ai
// Discovery: https://mcp.granola.ai/.well-known/oauth-protected-resource
// Auth server: https://mcp-auth.granola.ai

import { randomBytes, createHash } from 'crypto';

const AUTH_BASE = 'https://mcp-auth.granola.ai';
const SCOPES = 'openid email profile offline_access';


function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const hash = createHash('sha256').update(verifier).digest();
  const challenge = base64UrlEncode(hash);
  return { codeVerifier: verifier, codeChallenge: challenge };
}

export function buildAuthorizationUrl(
  redirectUri: string,
  state: string,
  codeChallenge: string,
  clientId: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_BASE}/oauth2/authorize?${params}`;
}

export async function registerClient(redirectUri: string): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      client_name: 'Today',
      scope: SCOPES,
      token_endpoint_auth_method: 'none',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Granola DCR failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { client_id?: string };
  if (!data.client_id) throw new Error('Granola DCR: no client_id');
  return data.client_id;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  clientId: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(`${AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Granola token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Granola token response missing tokens');
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(`${AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Granola token refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Granola refresh response missing tokens');
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 3600,
  };
}
