// ── USER SETTINGS ──
// GET: fetch Weekly Strategy and other settings
// PATCH: update Weekly Strategy
// Requires DATABASE_URL. Falls back gracefully if DB unavailable.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { defaultStrategy } from '@/lib/defaults';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userEmail: session.user.email },
    });
    return NextResponse.json({
      weeklyStrategy: settings?.weeklyStrategy ?? defaultStrategy,
      aiStrategyId: settings?.aiStrategyId ?? null,
      schedule: settings?.schedule ?? null,
    });
  } catch (err) {
    // DB not configured or connection failed
    console.warn('[settings] DB unavailable:', err);
    return NextResponse.json({
      weeklyStrategy: defaultStrategy,
      aiStrategyId: null,
      schedule: null,
    });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { weeklyStrategy?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.weeklyStrategy !== undefined) {
    if (!Array.isArray(body.weeklyStrategy) || body.weeklyStrategy.length !== 3) {
      return NextResponse.json(
        { error: 'weeklyStrategy must be an array of exactly 3 strings' },
        { status: 400 }
      );
    }
  }

  try {
    const settings = await prisma.userSettings.upsert({
      where: { userEmail: session.user.email },
      create: {
        userEmail: session.user.email,
        weeklyStrategy: body.weeklyStrategy ?? defaultStrategy,
      },
      update: {
        ...(body.weeklyStrategy && { weeklyStrategy: body.weeklyStrategy }),
      },
    });
    return NextResponse.json({
      weeklyStrategy: settings.weeklyStrategy,
      aiStrategyId: settings.aiStrategyId,
      schedule: settings.schedule,
    });
  } catch (err) {
    console.warn('[settings] DB unavailable:', err);
    return NextResponse.json(
      { error: 'Settings could not be saved. Database may not be configured.' },
      { status: 503 }
    );
  }
}
