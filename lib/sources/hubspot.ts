import type { Task } from '../types';
import type { SourceResult } from './superhuman';

// ── HUBSPOT DATA FETCHER ──
// HubSpot has a well-documented public API.
//
// Auth: Private App token (recommended over OAuth for personal use)
//   Settings → Integrations → Private Apps → Create
//   Scopes: crm.objects.deals.read, crm.objects.contacts.read, crm.objects.tasks.read
//
// Env vars: HUBSPOT_ACCESS_TOKEN

function mockTasks(): Task[] {
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

export async function fetchHubSpot(): Promise<SourceResult> {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!accessToken) return { tasks: mockTasks(), status: 'mock' };

  try {
    // TODO: Real HubSpot implementation:
    //
    // const res = await fetch(
    //   'https://api.hubapi.com/crm/v3/objects/deals' +
    //   '?properties=dealname,dealstage,amount,closedate,hs_lastmodifieddate&limit=20',
    //   { headers: { Authorization: `Bearer ${accessToken}` } }
    // );
    // const { results } = await res.json();
    // return { tasks: results.map(transformDealToTask), status: 'connected' };
    return { tasks: mockTasks(), status: 'mock' };
  } catch (err) {
    console.error('[hubspot]', err);
    return { tasks: [], status: 'error' };
  }
}
