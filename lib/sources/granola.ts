import type { Task } from '../types';
import type { SourceResult } from './superhuman';

// ── GRANOLA DATA FETCHER ──
// Env vars: GRANOLA_API_KEY

function mockTasks(): Task[] {
  return [
    {
      id: 1,
      title: 'Send revised proposal to Meridian Health',
      desc: "Jamie asked for updated pricing on Tier 2 after Friday's call. Contract window closes this week.",
      priority: 'high',
      activity: 'email',
      client: 'Meridian Health',
      project: 'Q1 Proposal',
      source: 'Granola · Friday 2pm',
      dueDate: '2026-03-05',
      completed: false,
      manual: false,
    },
    {
      id: 4,
      title: 'Prep for Meridian Health check-in call',
      desc: '30-min call Thursday 2pm. Key goal: confirm deal timeline and next steps.',
      priority: 'medium',
      activity: 'meeting',
      client: 'Meridian Health',
      project: 'Q1 Proposal',
      source: 'Granola · Calendar sync',
      dueDate: '2026-03-05',
      completed: false,
      manual: false,
    },
    {
      id: 8,
      title: 'Schedule quarterly review — Westside Creative',
      desc: 'QBR overdue by 2 weeks. 60-min slot needed in March.',
      priority: 'low',
      activity: 'meeting',
      client: 'Westside Creative',
      project: 'Account Health',
      source: 'Granola · Meeting notes',
      dueDate: '2026-03-02',
      completed: true,
      manual: false,
    },
  ];
}

export async function fetchGranola(): Promise<SourceResult> {
  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) return { tasks: mockTasks(), status: 'mock' };

  try {
    // TODO: replace with real implementation
    // const notes = await getMeetingActionItems(apiKey);
    // return { tasks: notes.map(transformNoteToTask), status: 'connected' };
    return { tasks: mockTasks(), status: 'mock' };
  } catch (err) {
    console.error('[granola]', err);
    return { tasks: [], status: 'error' };
  }
}
