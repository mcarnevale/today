// ── GRANOLA STATUS ──
// Returns whether the current user has Granola connected.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getGranolaTokens } from '@/lib/granola-tokens';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ connected: false });
  }
  const tokens = await getGranolaTokens(session.user.email);
  return NextResponse.json({ connected: !!tokens });
}
