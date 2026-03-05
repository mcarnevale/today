// ── GRANOLA OAUTH CALLBACK ──
// Exchanges code for tokens and stores them.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { exchangeCodeForTokens } from '@/lib/granola-oauth';
import {
  getOAuthState,
  deleteOAuthState,
  setGranolaTokens,
  type GranolaTokens,
} from '@/lib/granola-tokens';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('[granola callback] OAuth error:', error, searchParams.get('error_description'));
    const url = new URL('/', req.url);
    url.searchParams.set('granola_error', error);
    return NextResponse.redirect(url);
  }

  if (!code || !state) {
    const url = new URL('/', req.url);
    url.searchParams.set('granola_error', 'missing_params');
    return NextResponse.redirect(url);
  }

  const oauthState = await getOAuthState(state);
  if (!oauthState) {
    const url = new URL('/', req.url);
    url.searchParams.set('granola_error', 'invalid_state');
    return NextResponse.redirect(url);
  }

  if (oauthState.userId !== session.user.email) {
    const url = new URL('/', req.url);
    url.searchParams.set('granola_error', 'user_mismatch');
    return NextResponse.redirect(url);
  }

  await deleteOAuthState(state);

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    new URL(req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/callback/granola`;

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      redirectUri,
      oauthState.codeVerifier,
      oauthState.clientId
    );

    const granolaTokens: GranolaTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      client_id: oauthState.clientId,
    };

    await setGranolaTokens(oauthState.userId, granolaTokens);

    const url = new URL('/', req.url);
    url.searchParams.set('granola', 'connected');
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('[granola callback]', err);
    const url = new URL('/', req.url);
    url.searchParams.set('granola_error', 'token_exchange_failed');
    return NextResponse.redirect(url);
  }
}
