// ── GRANOLA DISCONNECT ──
// Removes stored Granola tokens for the current user.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteGranolaTokens } from '@/lib/granola-tokens';

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await deleteGranolaTokens(session.user.email);
  return NextResponse.json({ ok: true });
}
