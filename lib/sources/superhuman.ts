import type { Task } from '../types';

// ── SUPERHUMAN DATA FETCHER ──
// Called server-side by /api/tasks.
//
// Superhuman doesn't have a public API (as of 2026). To wire up real email tasks:
//   → Use Gmail API (Superhuman is built on Gmail)
//   → OAuth2: gmail.readonly scope
//   → Env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//   → Fetch threads with label "UNREAD" or "STARRED", map to Task schema
//
export interface SourceResult {
  tasks: Task[];
  status: 'connected' | 'disconnected' | 'error';
}

export async function fetchSuperhuman(): Promise<SourceResult> {
  const apiKey = process.env.SUPERHUMAN_API_KEY;
  if (!apiKey) return { tasks: [], status: 'disconnected' };

  try {
    // TODO: replace with real Superhuman API when available
    return { tasks: [], status: 'disconnected' };
  } catch (err) {
    console.error('[superhuman]', err);
    return { tasks: [], status: 'error' };
  }
}
