import type { Task } from '../types';
import type { SourceResult } from './superhuman';
import { getGranolaTokens, setGranolaTokens } from '../granola-tokens';
import { refreshAccessToken } from '../granola-oauth';
import { listMeetings, getMeetings, type GranolaMeeting } from '../mcp/granola-client';

// ── GRANOLA DATA FETCHER ──
// Two sources:
// 1. MCP (OAuth): Connect via /api/granola/connect — works on paid plans
// 2. Enterprise API: GRANOLA_API_KEY (Settings → Workspaces → API)

const GRANOLA_BASE = 'https://public-api.granola.ai';

interface GranolaNoteSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface GranolaNote extends GranolaNoteSummary {
  summary_text: string;
  summary_markdown?: string | null;
  calendar_event?: {
    event_title: string | null;
    scheduled_start_time: string | null;
  } | null;
}

function formatGranolaDate(iso: string | null): string {
  if (!iso) return 'Meeting notes';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now);
  isYesterday.setDate(isYesterday.getDate() - 1);
  if (d.toDateString() === isYesterday.toDateString()) return 'Yesterday';
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function transformMeetingToTask(meeting: GranolaMeeting, index: number): Task {
  const title = (meeting.title as string) || 'Meeting';
  const summary = (meeting.summary as string) || 'No summary yet.';
  const startTime = meeting.start_time as string | undefined;
  const dueDate = startTime ? startTime.split('T')[0] : null;
  const sourceLabel = formatGranolaDate(startTime ?? null);

  return {
    id: 40000 + index,
    title: title.length > 80 ? title.slice(0, 77) + '…' : title,
    desc: summary.length > 300 ? summary.slice(0, 297) + '…' : summary,
    priority: 'medium',
    activity: 'meeting',
    client: 'Granola',
    project: title.length > 40 ? title.slice(0, 37) + '…' : title,
    sourceId: meeting.id,
    sourceType: 'granola',
    source: `Granola · ${sourceLabel}`,
    dueDate,
    completed: false,
    manual: false,
  };
}

function transformNoteToTask(note: GranolaNote, index: number): Task {
  const title = note.title || note.calendar_event?.event_title || 'Meeting notes';
  const summary = note.summary_text?.trim() || 'No summary yet.';
  const startTime = note.calendar_event?.scheduled_start_time;
  const dueDate = startTime ? startTime.split('T')[0] : null;
  const sourceLabel = formatGranolaDate(startTime || note.created_at);

  return {
    id: 40000 + index,
    sourceId: note.id,
    sourceType: 'granola',
    title: title.length > 80 ? title.slice(0, 77) + '…' : title,
    desc: summary.length > 300 ? summary.slice(0, 297) + '…' : summary,
    priority: 'medium',
    activity: 'meeting',
    client: 'Granola',
    project: title.length > 40 ? title.slice(0, 37) + '…' : title,
    source: `Granola · ${sourceLabel}`,
    dueDate,
    completed: false,
    manual: false,
  };
}

// ── RICH MEETING DATA (for AI analysis only) ──
export interface RichMeeting {
  id: string;
  title: string;
  date: string;           // ISO date string
  attendees?: string[];
  notes: string;          // Full summary — no truncation
}

// Returns full meeting content for AI analysis
export async function fetchGranolaRich(userId?: string | null): Promise<RichMeeting[]> {
  // Try MCP OAuth
  if (userId) {
    const tokens = await getGranolaTokens(userId);
    if (tokens) {
      try {
        let accessToken = tokens.access_token;
        if (Date.now() >= tokens.expires_at - 60_000) {
          const clientId = tokens.client_id;
          if (clientId) {
            const refreshed = await refreshAccessToken(tokens.refresh_token, clientId);
            accessToken = refreshed.access_token;
            await setGranolaTokens(userId, {
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
              expires_at: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
              client_id: clientId,
            });
          }
        }
        const meetings = await listMeetings(accessToken);
        const ids = meetings.slice(0, 15).map((m) => m.id).filter(Boolean);
        const fullMeetings = ids.length > 0 ? await getMeetings(accessToken, ids) : [];
        return fullMeetings.map((m) => ({
          id: m.id,
          title: (m.title as string) || 'Untitled Meeting',
          date: (m.start_time as string) || '',
          attendees: Array.isArray(m.attendees) ? (m.attendees as string[]) : undefined,
          notes: String(
            (m as Record<string, unknown>).notes ??
            (m as Record<string, unknown>).transcript_summary ??
            m.summary ?? ''
          ).trim().slice(0, 3000),
        }));
      } catch (err) {
        console.error('[granola rich MCP]', err);
      }
    }
  }

  // Try Enterprise API
  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) return [];

  try {
    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - 14);
    const listRes = await fetch(
      `${GRANOLA_BASE}/v1/notes?created_after=${createdAfter.toISOString()}&page_size=15`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!listRes.ok) return [];
    const listData = await listRes.json();
    const notes: GranolaNoteSummary[] = listData.notes || [];
    const results: RichMeeting[] = [];
    for (const n of notes.slice(0, 15)) {
      const getRes = await fetch(`${GRANOLA_BASE}/v1/notes/${n.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!getRes.ok) continue;
      const fullNote: GranolaNote = await getRes.json();
      const notes_text = (fullNote.summary_markdown || fullNote.summary_text || '').trim();
      results.push({
        id: fullNote.id,
        title: fullNote.title || fullNote.calendar_event?.event_title || 'Meeting notes',
        date: fullNote.calendar_event?.scheduled_start_time || fullNote.created_at,
        notes: notes_text.slice(0, 3000),
      });
    }
    return results;
  } catch (err) {
    console.error('[granola rich]', err);
    return [];
  }
}

export async function fetchGranola(userId?: string | null): Promise<SourceResult> {
  // 1. Try MCP (OAuth) if user is known
  if (userId) {
    const tokens = await getGranolaTokens(userId);
    if (tokens) {
      try {
        let accessToken = tokens.access_token;
        if (Date.now() >= tokens.expires_at - 60_000) {
          const clientId = tokens.client_id;
          if (!clientId) {
            console.warn('[granola] No client_id for refresh');
          } else {
            const refreshed = await refreshAccessToken(tokens.refresh_token, clientId);
            accessToken = refreshed.access_token;
            await setGranolaTokens(userId, {
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
              expires_at: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
              client_id: clientId,
            });
          }
        }
        const start = new Date();
        start.setDate(start.getDate() - 14);
        const end = new Date();
        const meetings = await listMeetings(accessToken);
        const ids = meetings.slice(0, 50).map((m) => m.id).filter(Boolean);
        const fullMeetings = ids.length > 0 ? await getMeetings(accessToken, ids) : [];
        const tasks = fullMeetings.map((m, i) => transformMeetingToTask(m, i));
        return { tasks, status: 'connected' };
      } catch (err) {
        console.error('[granola MCP]', err);
        return { tasks: [], status: 'error' };
      }
    }
  }

  // 2. Try Enterprise API
  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) return { tasks: [], status: 'disconnected' };

  try {
    // List notes from last 14 days
    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - 14);
    const listRes = await fetch(
      `${GRANOLA_BASE}/v1/notes?created_after=${createdAfter.toISOString()}&page_size=50`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!listRes.ok) {
      console.error('[granola] list', listRes.status, await listRes.text());
      return { tasks: [], status: 'error' };
    }

    const listData = await listRes.json();
    const notes: GranolaNoteSummary[] = listData.notes || [];

    if (notes.length === 0) return { tasks: [], status: 'connected' };

    // Fetch full note details (including summary) for each
    const tasks: Task[] = [];
    for (let i = 0; i < Math.min(notes.length, 50); i++) {
      const n = notes[i];
      const getRes = await fetch(`${GRANOLA_BASE}/v1/notes/${n.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!getRes.ok) continue;
      const fullNote: GranolaNote = await getRes.json();
      tasks.push(transformNoteToTask(fullNote, i));
    }

    return { tasks, status: 'connected' };
  } catch (err) {
    console.error('[granola]', err);
    return { tasks: [], status: 'error' };
  }
}
