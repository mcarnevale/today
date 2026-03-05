// ── GRANOLA CONNECT ──
// Initiates OAuth flow. Redirects to Granola auth page.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  generatePKCE,
  buildAuthorizationUrl,
  registerClient,
} from '@/lib/granola-oauth';
import { setOAuthState } from '@/lib/granola-tokens';
import { randomBytes } from 'crypto';

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const userId = session.user.email;
  const { searchParams } = new URL(req.url);
  const redirectAfter = searchParams.get('redirect') ?? '/';

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    new URL(req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/callback/granola`;

  try {
    const clientId = await registerClient(redirectUri);
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = base64UrlEncode(randomBytes(16));

    await setOAuthState(state, { codeVerifier, userId, clientId });

    const authUrl = buildAuthorizationUrl(
      redirectUri,
      state,
      codeChallenge,
      clientId
    );
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error('[granola connect]', err);
    const url = new URL('/', req.url);
    url.searchParams.set('granola_error', 'connect_failed');
    return NextResponse.redirect(url);
  }
}
