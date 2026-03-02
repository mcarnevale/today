import { NextResponse } from 'next/server';
import type { Task } from '@/lib/types';

// ── SUPERHUMAN INTEGRATION ──
// TODO: Replace mock data with real Superhuman API calls.
//
// Superhuman doesn't have a public API yet (as of 2026).
// Options when ready:
//   1. Gmail API (Superhuman is built on Gmail) — OAuth2 + gmail.readonly scope
//   2. Superhuman native API if/when it ships
//
// Env vars needed:
//   SUPERHUMAN_CLIENT_ID, SUPERHUMAN_CLIENT_SECRET, SUPERHUMAN_REFRESH_TOKEN
//   (or GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)
//
// The transform function below is where you'll map raw email objects
// → the unified Task schema.

async function fetchSuperhuman(): Promise<Task[]> {
  const apiKey = process.env.SUPERHUMAN_API_KEY;

  if (!apiKey) {
    // No key configured — return mock data so the UI still works
    return getMockTasks();
  }

  // TODO: Real implementation
  // const emails = await getUnreadEmailsNeedingAction(apiKey);
  // return emails.map(transformEmailToTask);

  return getMockTasks();
}

function getMockTasks(): Task[] {
  return [
    {
      id: 2,
      title: 'Follow up: Apex Foundation grant timeline',
      desc: 'No response to last two emails. Board meeting is March 15 — need sign-off before then.',
      priority: 'high',
      activity: 'email',
      client: 'Apex Foundation',
      project: 'Grant Renewal',
      source: 'Superhuman · 2 days ago',
      dueDate: '2026-03-15',
      completed: false,
      manual: false,
    },
    {
      id: 3,
      title: 'Review SOW draft for Westside Creative',
      desc: 'Tom sent over v2 of the scope — two open questions on deliverables timeline.',
      priority: 'high',
      activity: 'focus',
      client: 'Westside Creative',
      project: 'New SOW',
      source: 'Superhuman · Today 9am',
      dueDate: '2026-03-04',
      completed: false,
      manual: false,
    },
    {
      id: 7,
      title: 'Reply to Carlos re: referral intro',
      desc: 'Carlos connected you with a potential new client. Short reply to confirm interest.',
      priority: 'low',
      activity: 'email',
      client: 'Prospects',
      project: 'Business Dev',
      source: 'Superhuman · Yesterday',
      dueDate: '2026-03-03',
      completed: false,
      manual: false,
    },
  ];
}

export async function GET() {
  try {
    const tasks = await fetchSuperhuman();
    return NextResponse.json({ tasks, source: 'superhuman', status: 'mock' });
  } catch (err) {
    console.error('[superhuman]', err);
    return NextResponse.json(
      { tasks: [], source: 'superhuman', status: 'error' },
      { status: 500 }
    );
  }
}
