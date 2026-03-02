import { NextResponse } from 'next/server';
import type { Task } from '@/lib/types';

// ── HUBSPOT INTEGRATION ──
// TODO: Replace mock data with real HubSpot API calls.
//
// HubSpot has a well-documented public API.
// Relevant endpoints:
//   GET /crm/v3/objects/deals — fetch open deals
//   GET /crm/v3/objects/contacts — fetch contacts
//   GET /crm/v3/objects/tasks — fetch tasks assigned to you
//
// Auth: Private App token (recommended over OAuth for personal use)
//   → Settings → Integrations → Private Apps → Create
//   → Scopes: crm.objects.deals.read, crm.objects.contacts.read, crm.objects.tasks.read
//
// Env vars needed:
//   HUBSPOT_ACCESS_TOKEN
//
// The transform function maps deals/tasks → unified Task schema.
// Stale deals (no activity > 2 weeks) auto-generate medium-priority tasks.

async function fetchHubSpot(): Promise<Task[]> {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

  if (!accessToken) {
    return getMockTasks();
  }

  // TODO: Real implementation example:
  //
  // const res = await fetch(
  //   'https://api.hubapi.com/crm/v3/objects/deals?properties=dealname,dealstage,amount,closedate,hs_lastmodifieddate&limit=20',
  //   { headers: { Authorization: `Bearer ${accessToken}` } }
  // );
  // const { results } = await res.json();
  // return results.map(transformDealToTask);

  return getMockTasks();
}

function getMockTasks(): Task[] {
  return [
    {
      id: 5,
      title: 'Update HubSpot deal stage: Apex Foundation',
      desc: "Deal has been in 'Proposal' for 3 weeks. Either advance or flag as at-risk.",
      priority: 'medium',
      activity: 'other',
      client: 'Apex Foundation',
      project: 'Grant Renewal',
      source: 'HubSpot · Stale deal',
      dueDate: null,
      completed: false,
      manual: false,
    },
    {
      id: 6,
      title: 'Block 2hrs to finalize Q1 impact report',
      desc: 'Deadline is end of week. First draft 70% done — needs data section and exec summary.',
      priority: 'medium',
      activity: 'focus',
      client: 'Internal',
      project: 'Q1 Impact Report',
      source: 'Manual',
      dueDate: '2026-03-06',
      completed: false,
      manual: true,
    },
  ];
}

export async function GET() {
  try {
    const tasks = await fetchHubSpot();
    return NextResponse.json({ tasks, source: 'hubspot', status: 'mock' });
  } catch (err) {
    console.error('[hubspot]', err);
    return NextResponse.json(
      { tasks: [], source: 'hubspot', status: 'error' },
      { status: 500 }
    );
  }
}
