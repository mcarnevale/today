// ── AI ANALYSIS TRIGGER ──
// POST: Fetch rich content from all sources, generate action items with Claude,
//       store in GeneratedTask table.
// Requires: auth, ANTHROPIC_API_KEY, DATABASE_URL.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchGmailRich } from '@/lib/sources/gmail';
import { fetchGranolaRich } from '@/lib/sources/granola';
import { fetchHubSpotRich } from '@/lib/sources/hubspot';
import { prisma } from '@/lib/db';
import { defaultStrategy } from '@/lib/defaults';
import { runAIGeneration, storeGeneratedTasks } from '@/lib/ai/analyze';

export async function POST() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI analysis not configured. Set ANTHROPIC_API_KEY.' },
      { status: 503 }
    );
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  let runRecord: { id: string } | null = null;

  try {
    runRecord = await prisma.analysisRun.create({
      data: { userEmail, startedAt, status: 'running', taskCount: null },
    });
  } catch (err) {
    console.warn('[ai/analyze] Could not create AnalysisRun:', err);
  }

  try {
    // Fetch rich content from all sources in parallel
    const [emails, meetings, deals] = await Promise.all([
      fetchGmailRich(),
      fetchGranolaRich(userEmail),
      fetchHubSpotRich(),
    ]);

    console.log(`[ai/analyze] Rich context: ${emails.length} emails, ${meetings.length} meetings, ${deals.length} deals`);

    // Load weekly strategy
    const settings = await prisma.userSettings.findUnique({ where: { userEmail } });
    const weeklyStrategy = settings?.weeklyStrategy ?? defaultStrategy;

    // Generate action items
    const generated = await runAIGeneration(emails, meetings, deals, weeklyStrategy);
    await storeGeneratedTasks(userEmail, generated, runId);

    if (runRecord) {
      await prisma.analysisRun.update({
        where: { id: runRecord.id },
        data: { completedAt: new Date(), status: 'completed', taskCount: generated.length },
      });
    }

    return NextResponse.json({
      ok: true,
      runId,
      generated: generated.length,
      context: { emails: emails.length, meetings: meetings.length, deals: deals.length },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[ai/analyze] Failed:', err);

    if (runRecord) {
      try {
        await prisma.analysisRun.update({
          where: { id: runRecord.id },
          data: { completedAt: new Date(), status: 'failed', errorMsg },
        });
      } catch (_) {}
    }

    return NextResponse.json(
      { error: 'Analysis failed', details: errorMsg },
      { status: 500 }
    );
  }
}
