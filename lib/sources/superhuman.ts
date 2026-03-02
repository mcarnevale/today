import type { Task } from '../types';

// ── SUPERHUMAN DATA FETCHER ──
// Called server-side by /api/tasks. Swap the body of fetchSuperhuman()
// for real API calls once you have credentials in .env.local.
//
// Superhuman doesn't have a public API yet (as of 2026).
// Options:
//   1. Gmail API (Superhuman runs on Gmail) — OAuth2 + gmail.readonly scope
//   2. Superhuman native API if/when it ships
//
// Env vars: SUPERHUMAN_API_KEY or GMAIL_REFRESH_TOKEN

export interface SourceResult {
  tasks: Task[];
  status: 'connected' | 'mock' | 'error';
}

function mockTasks(): Task[] {
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

export async function fetchSuperhuman(): Promise<SourceResult> {
  const apiKey = process.env.SUPERHUMAN_API_KEY;
  if (!apiKey) return { tasks: mockTasks(), status: 'mock' };

  try {
    // TODO: replace with real implementation
    // const emails = await getEmailsNeedingAction(apiKey);
    // return { tasks: emails.map(transformEmailToTask), status: 'connected' };
    return { tasks: mockTasks(), status: 'mock' };
  } catch (err) {
    console.error('[superhuman]', err);
    return { tasks: [], status: 'error' };
  }
}
