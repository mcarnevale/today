import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchGmail } from '@/lib/sources/gmail';
import { fetchGranola } from '@/lib/sources/granola';
import { fetchHubSpot } from '@/lib/sources/hubspot';
import { getAIResults, getGeneratedTasks } from '@/lib/ai/analyze';
import type { Task } from '@/lib/types';

// ── TASK AGGREGATOR ──
// GET: Returns source tasks (for grouped views) + AI-generated tasks (for Inbox).
//
// Wired:
//   - HUBSPOT_ACCESS_TOKEN → fetches deals from HubSpot CRM
//   - GRANOLA → MCP OAuth (Connect Granola) or GRANOLA_API_KEY (Enterprise)
//   - GMAIL_* → fetches unread emails from Gmail

function deduplicate(tasks: Task[]): Task[] {
  const seen = new Set<number>();
  return tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.email ?? null;

  const [gmail, granola, hubspot, aiResults, generatedTasks] = await Promise.all([
    fetchGmail(),
    fetchGranola(userId),
    fetchHubSpot(),
    userId ? getAIResults(userId) : Promise.resolve(new Map()),
    userId ? getGeneratedTasks(userId) : Promise.resolve([]),
  ]);

  const allTasks = deduplicate([
    ...gmail.tasks,
    ...granola.tasks,
    ...hubspot.tasks,
  ]).sort((a, b) => a.id - b.id);

  // Merge legacy AI scoring results when present
  const merged = allTasks.map((t) => {
    if (!t.sourceId || !t.sourceType || !userId) return t;
    const key = `${String(t.sourceType).toLowerCase()}:${String(t.sourceId)}`;
    const ai = aiResults.get(key);
    if (!ai) return t;
    return { ...t, priority: ai.priority, aiScore: ai.score, aiFollowUp: ai.followUp };
  });

  return NextResponse.json({
    tasks: merged,
    generatedTasks,
    sources: {
      gmail: gmail.status,
      granola: granola.status,
      hubspot: hubspot.status,
    },
    sourceCounts: {
      gmail: gmail.tasks.length,
      granola: granola.tasks.length,
      hubspot: hubspot.tasks.length,
    },
    refreshedAt: new Date().toISOString(),
  });
}
