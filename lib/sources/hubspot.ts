import type { Task } from '../types';
import type { SourceResult } from './superhuman';

// ── HUBSPOT DATA FETCHER ──
// HubSpot has a well-documented public API.
//
// Auth: Private App token (recommended over OAuth for personal use)
//   Settings → Integrations → Private Apps → Create
//   Scopes: crm.objects.deals.read
//
// Env vars: HUBSPOT_ACCESS_TOKEN

const HUBSPOT_BASE = 'https://api.hubapi.com';

// Exclude only closed stages. HubSpot returns internal IDs (e.g. "appointmentscheduled", "closedwon").
// Include all open deals; exclude closedwon, closedlost, and similar.
const EXCLUDED_STAGE_PATTERNS = [
  'closedwon',
  'closedlost',
  'closed_won',
  'closed_lost',
];

function normalizeStage(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '');
}

function isExcludedStage(stage: string): boolean {
  const n = normalizeStage(stage);
  return EXCLUDED_STAGE_PATTERNS.some((p) => n === p || n.includes(p) || p.includes(n));
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    amount?: string;
    closedate?: string;
    hs_lastmodifieddate?: string;
  };
}

function transformDealToTask(deal: HubSpotDeal, index: number): Task {
  const name = deal.properties.dealname || 'Untitled deal';
  const stage = deal.properties.dealstage || 'unknown';
  const modified = deal.properties.hs_lastmodifieddate;
  const closedate = deal.properties.closedate;
  const amount = deal.properties.amount;

  // Stale = no activity in 2+ weeks
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const modDate = modified ? new Date(modified) : null;
  const isStale = modDate && modDate < twoWeeksAgo;

  const dueDate = closedate ? closedate.split('T')[0] : null;
  const descParts: string[] = [];
  if (stage) descParts.push(`Stage: ${stage}`);
  if (amount && !isNaN(Number(amount))) descParts.push(`Amount: $${Number(amount).toLocaleString()}`);
  if (isStale) descParts.push('No activity in 2+ weeks — advance or flag as at-risk.');

  return {
    id: 50000 + index,
    title: isStale ? `Update deal: ${name}` : name,
    desc: descParts.length > 0 ? descParts.join('. ') : 'Open deal in HubSpot.',
    priority: isStale ? 'medium' : 'low',
    activity: 'other',
    client: 'HubSpot',
    project: name.length > 30 ? name.slice(0, 27) + '…' : name,
    source: isStale ? 'HubSpot · Stale deal' : `HubSpot · ${name}`,
    dueDate,
    completed: false,
    manual: false,
    sourceId: deal.id,
    sourceType: 'hubspot',
  };
}

// ── RICH DEAL DATA (for AI analysis only) ──
export interface RichDeal {
  id: string;
  name: string;
  stage: string;
  amount: string | null;
  closeDate: string | null;
  lastActivity: string;    // "X days ago" or "today"
  description: string | null;
  probability: string | null;
}

function daysAgoLabel(isoDate: string | null | undefined): string {
  if (!isoDate) return 'unknown';
  const diffDays = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

// Fetch enriched deal data for AI analysis
export async function fetchHubSpotRich(): Promise<RichDeal[]> {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!accessToken) return [];

  try {
    const props = [
      'dealname', 'dealstage', 'amount', 'closedate',
      'hs_lastmodifieddate', 'description',
      'hs_deal_stage_probability', 'hs_pipeline',
    ];
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
          ],
        }],
        properties: props,
        limit: 50,
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      }),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { results?: HubSpotDeal[] };
    const deals = (data.results || []).filter(
      (d) => !isExcludedStage(d.properties?.dealstage || '')
    );

    return deals.map((d) => ({
      id: d.id,
      name: d.properties.dealname || 'Untitled deal',
      stage: d.properties.dealstage || 'unknown',
      amount: d.properties.amount && !isNaN(Number(d.properties.amount))
        ? `$${Number(d.properties.amount).toLocaleString()}`
        : null,
      closeDate: d.properties.closedate ? d.properties.closedate.split('T')[0] : null,
      lastActivity: daysAgoLabel(d.properties.hs_lastmodifieddate),
      description: (d.properties as Record<string, string>).description?.trim() || null,
      probability: (d.properties as Record<string, string>).hs_deal_stage_probability || null,
    }));
  } catch (err) {
    console.error('[hubspot rich]', err);
    return [];
  }
}

export async function fetchHubSpot(): Promise<SourceResult> {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!accessToken) return { tasks: [], status: 'disconnected' };

  try {
    const props = ['dealname', 'dealstage', 'amount', 'closedate', 'hs_lastmodifieddate'];
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
              { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
            ],
          },
        ],
        properties: props,
        limit: 50,
      }),
    });

    if (!res.ok) {
      console.error('[hubspot]', res.status, await res.text());
      return { tasks: [], status: 'error' };
    }

    const data = (await res.json()) as { results?: HubSpotDeal[] };
    const results: HubSpotDeal[] = (data.results || []).filter(
      (d: HubSpotDeal) => !isExcludedStage(d.properties?.dealstage || '')
    );
    const tasks = results.map((d, i) => transformDealToTask(d, i));
    return { tasks, status: 'connected' };
  } catch (err) {
    console.error('[hubspot]', err);
    return { tasks: [], status: 'error' };
  }
}
