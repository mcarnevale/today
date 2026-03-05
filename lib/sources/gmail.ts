import { google } from 'googleapis';
import type { Task } from '../types';
import type { SourceResult } from './superhuman';

// ── GMAIL DATA FETCHER ──
// Fetches unread emails and maps them to tasks.
//
// Env vars:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//
// To obtain a refresh token, run: npm run gmail:auth
// (Uses the same Google Cloud project as NextAuth — add gmail.readonly scope)

function getHeader(headers: { name?: string; value?: string }[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value?.trim() || '';
}

function formatGmailDate(dateStr: string): string {
  const d = new Date(parseInt(dateStr, 10));
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return `Gmail · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (diffDays === 1) return 'Gmail · Yesterday';
  if (diffDays < 7) return `Gmail · ${diffDays} days ago`;
  return `Gmail · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function transformMessageToTask(msg: { id?: string | null; internalDate?: string | null; snippet?: string | null; payload?: { headers?: { name?: string; value?: string }[] } }, index: number): Task {
  const subject = getHeader(msg.payload?.headers, 'Subject') || '(No subject)';
  const from = getHeader(msg.payload?.headers, 'From');
  const snippet = (msg.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const sourceLabel = formatGmailDate(msg.internalDate || '0');

  // Extract sender name/domain for client
  const fromMatch = from.match(/^(.+?)\s*<|@([^>@]+)/);
  const client = fromMatch ? (fromMatch[1]?.trim() || fromMatch[2] || 'Email').replace(/^["']|["']$/g, '') : 'Email';

  return {
    id: 20000 + index,
    title: subject.length > 80 ? subject.slice(0, 77) + '…' : subject,
    desc: snippet || 'No preview',
    priority: 'medium',
    activity: 'email',
    client,
    project: 'Inbox',
    source: sourceLabel,
    dueDate: null,
    completed: false,
    manual: false,
    sourceId: msg.id ?? undefined,
    sourceType: 'gmail',
  };
}

// ── RICH EMAIL DATA (for AI analysis only) ──
export interface RichEmail {
  id: string;
  from: string;       // Full "Name <email>" string
  subject: string;
  date: string;       // Relative label e.g. "2 days ago"
  body: string;       // Decoded plain-text body, up to 1500 chars
}

function decodeBase64url(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

// Recursively find plain-text body in a Gmail message payload
function extractPlainText(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: typeof payload[] | null;
} | null | undefined): string {
  if (!payload) return '';
  if (payload.mimeType?.startsWith('text/plain') && payload.body?.data) {
    return decodeBase64url(payload.body.data);
  }
  if (payload.parts?.length) {
    // Prefer text/plain in parts
    for (const part of payload.parts) {
      if (part?.mimeType === 'text/plain' && part?.body?.data) {
        return decodeBase64url(part.body.data);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part?.parts) {
        const nested = extractPlainText(part);
        if (nested) return nested;
      }
    }
    // Fall back to HTML
    for (const part of payload.parts) {
      if (part?.mimeType === 'text/html' && part?.body?.data) {
        const html = decodeBase64url(part.body.data);
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  if (payload.mimeType?.startsWith('text/html') && payload.body?.data) {
    const html = decodeBase64url(payload.body.data);
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function relativeDate(internalDate: string | null | undefined): string {
  if (!internalDate) return 'unknown date';
  const ms = parseInt(internalDate, 10);
  const diffDays = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

// Fetch full email bodies for AI analysis (up to 25 most recent unread)
export async function fetchGmailRich(): Promise<RichEmail[]> {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return [];

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    oauth2.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread -in:spam -in:trash -category:promotions -category:social -category:updates -category:forums',
      maxResults: 25,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return [];

    const results: RichEmail[] = [];
    for (const m of messages) {
      if (!m.id) continue;
      try {
        const getRes = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'full',
        });
        const msg = getRes.data;
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '(No subject)';
        const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'Unknown';
        const rawBody = extractPlainText(msg.payload as Parameters<typeof extractPlainText>[0]);
        const body = rawBody.replace(/\s+/g, ' ').trim().slice(0, 1500);
        results.push({
          id: m.id,
          from,
          subject,
          date: relativeDate(msg.internalDate),
          body: body || msg.snippet?.slice(0, 500) || 'No content',
        });
      } catch {
        // skip individual message errors
      }
    }
    return results;
  } catch (err) {
    console.error('[gmail rich]', err);
    return [];
  }
}

export async function fetchGmail(): Promise<SourceResult> {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { tasks: [], status: 'disconnected' };
  }

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    oauth2.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Exclude spam, trash, promotions, social, updates, forums
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread -in:spam -in:trash -category:promotions -category:social -category:updates -category:forums',
      maxResults: 50,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return { tasks: [], status: 'connected' };

    const tasks: Task[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m.id) continue;
      const getRes = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });
      tasks.push(transformMessageToTask(getRes.data as { id?: string; internalDate?: string; snippet?: string; payload?: { headers?: { name?: string; value?: string }[] } }, i));
    }

    return { tasks, status: 'connected' };
  } catch (err) {
    console.error('[gmail]', err);
    return { tasks: [], status: 'error' };
  }
}
