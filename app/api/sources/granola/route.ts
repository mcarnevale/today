import { NextResponse } from 'next/server';
import type { Task } from '@/lib/types';

// ── GRANOLA INTEGRATION ──
// TODO: Replace mock data with real Granola API calls.
//
// Granola has an unofficial/internal API. When a public API ships:
//   - Fetch recent meeting notes
//   - Parse action items flagged during meetings
//   - Map attendees → clients, meeting titles → project names
//
// Env vars needed:
//   GRANOLA_API_KEY
//
// The transform function below maps meeting note objects
// → the unified Task schema (activity: 'meeting' or 'focus').

async function fetchGranola(): Promise<Task[]> {
  const apiKey = process.env.GRANOLA_API_KEY;

  if (!apiKey) {
    return getMockTasks();
  }

  // TODO: Real implementation
  // const notes = await getRecentMeetingActionItems(apiKey);
  // return notes.map(transformNoteToTask);

  return getMockTasks();
}

function getMockTasks(): Task[] {
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

export async function GET() {
  try {
    const tasks = await fetchGranola();
    return NextResponse.json({ tasks, source: 'granola', status: 'mock' });
  } catch (err) {
    console.error('[granola]', err);
    return NextResponse.json(
      { tasks: [], source: 'granola', status: 'error' },
      { status: 500 }
    );
  }
}
