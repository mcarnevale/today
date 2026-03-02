import { NextResponse } from 'next/server';
import { fetchSuperhuman } from '@/lib/sources/superhuman';
import { fetchGranola } from '@/lib/sources/granola';
import { fetchHubSpot } from '@/lib/sources/hubspot';
import type { Task } from '@/lib/types';

// ── TASK AGGREGATOR ──
// Single endpoint the frontend calls. Directly imports source fetchers
// (no internal HTTP calls) — clean, fast, works in all environments.
//
// Upgrade path:
//   1. Add HUBSPOT_ACCESS_TOKEN to .env.local → HubSpot goes live
//   2. Add GRANOLA_API_KEY → Granola goes live
//   3. Add GMAIL credentials → Superhuman/Gmail goes live
//   4. Replace scoring in app/page.tsx with a Claude API call that ranks
//      tasks using full email/note/deal context

function deduplicate(tasks: Task[]): Task[] {
  const seen = new Set<number>();
  return tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export async function GET() {
  const [superhuman, granola, hubspot] = await Promise.all([
    fetchSuperhuman(),
    fetchGranola(),
    fetchHubSpot(),
  ]);

  const allTasks = deduplicate([
    ...superhuman.tasks,
    ...granola.tasks,
    ...hubspot.tasks,
  ]).sort((a, b) => a.id - b.id);

  return NextResponse.json({
    tasks: allTasks,
    sources: {
      superhuman: superhuman.status,
      granola: granola.status,
      hubspot: hubspot.status,
    },
    refreshedAt: new Date().toISOString(),
  });
}
