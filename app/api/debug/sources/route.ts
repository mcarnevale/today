// ── SOURCE DIAGNOSTICS ──
// GET: Returns raw diagnostic info for each source to debug 0-item issues.
// Visit /api/debug/sources while logged in. Remove or protect in production.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getGranolaTokens } from '@/lib/granola-tokens';
import { listMeetings } from '@/lib/mcp/granola-client';

const HUBSPOT_BASE = 'https://api.hubapi.com';
const GRANOLA_BASE = 'https://public-api.granola.ai';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const diagnostics: Record<string, Record<string, unknown>> = {};

  // Gmail
  const hasGmail =
    (process.env.GMAIL_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
    (process.env.GMAIL_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET) &&
    process.env.GMAIL_REFRESH_TOKEN;
  diagnostics.gmail = {} as Record<string, unknown>;
  Object.assign(diagnostics.gmail, {
    configured: !!hasGmail,
    hasClientId: !!(process.env.GMAIL_CLIENT_ID || process.env.AUTH_GOOGLE_ID),
    hasRefreshToken: !!process.env.GMAIL_REFRESH_TOKEN,
  });

  // Granola — try actual fetch
  const granolaTokens = await getGranolaTokens(session.user.email);
  const hasGranolaApiKey = !!process.env.GRANOLA_API_KEY;
  diagnostics.granola = {
    oauthTokens: !!granolaTokens,
    hasApiKey: hasGranolaApiKey,
    path: granolaTokens ? 'OAuth (MCP)' : hasGranolaApiKey ? 'API key (notes)' : 'none',
  } as Record<string, unknown>;
  if (granolaTokens) {
    try {
      const start = new Date();
      start.setDate(start.getDate() - 14);
      const end = new Date();
      const meetingsWithFilter = await listMeetings(
        granolaTokens.access_token,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0]
      );
      const meetingsNoFilter = await listMeetings(granolaTokens.access_token);
      diagnostics.granola.listMeetingsCountWithDateFilter = meetingsWithFilter.length;
      diagnostics.granola.listMeetingsCountNoFilter = meetingsNoFilter.length;
      diagnostics.granola.sampleIds = meetingsNoFilter.slice(0, 3).map((m) => m.id).filter(Boolean);
    } catch (err) {
      diagnostics.granola.error = err instanceof Error ? err.message : String(err);
    }
  } else if (hasGranolaApiKey) {
    try {
      const createdAfter = new Date();
      createdAfter.setDate(createdAfter.getDate() - 14);
      const res = await fetch(
        `${GRANOLA_BASE}/v1/notes?created_after=${createdAfter.toISOString()}&page_size=10`,
        { headers: { Authorization: `Bearer ${process.env.GRANOLA_API_KEY}` } }
      );
      const data = (await res.json()) as { notes?: unknown[] };
      diagnostics.granola.notesCount = data.notes?.length ?? 0;
      diagnostics.granola.httpStatus = res.status;
      if (!res.ok) {
        diagnostics.granola.error = await res.text();
      }
    } catch (err) {
      diagnostics.granola.error = err instanceof Error ? err.message : String(err);
    }
  }

  // HubSpot — raw API call
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  diagnostics.hubspot = {
    hasToken: !!accessToken,
  } as Record<string, unknown>;
  if (accessToken) {
    try {
      const searchRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
                { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
              ],
            },
          ],
          properties: ['dealname', 'dealstage'],
          limit: 10,
        }),
      });
      const data = (await searchRes.json()) as { results?: unknown[]; message?: string };
      diagnostics.hubspot.httpStatus = searchRes.status;
      diagnostics.hubspot.openDealsCount = data.results?.length ?? 0;
      if (data.results?.length) {
        diagnostics.hubspot.sampleStages = (data.results as { properties?: { dealstage?: string } }[])
          .slice(0, 5)
          .map((r) => r.properties?.dealstage ?? 'none');
      }
      if (!searchRes.ok) {
        diagnostics.hubspot.error = data.message ?? 'Request failed';
      }
    } catch (err) {
      diagnostics.hubspot.error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(diagnostics);
}
