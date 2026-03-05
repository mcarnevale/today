// ── AI TASK GENERATION ──
// Fetches RICH content from all sources (full email bodies, full meeting notes,
// enriched deal data) and asks Claude to GENERATE action items with context —
// rather than simply scoring pre-extracted tasks.
//
// Env: ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk';
import type { Task } from '../types';
import type { RichEmail } from '../sources/gmail';
import type { RichMeeting } from '../sources/granola';
import type { RichDeal } from '../sources/hubspot';
import { prisma } from '../db';

// ── LEGACY: scoring-based result (kept for backward compat) ──
export interface AITaskResult {
  sourceId: string;
  sourceType: 'gmail' | 'granola' | 'hubspot';
  priority: 'high' | 'medium' | 'low';
  score: number;
  followUp: string | null;
}

// ── NEW: AI-generated action item ──
export interface AIGeneratedTask {
  rank: number;
  title: string;
  context: string;
  priority: 'high' | 'medium' | 'low';
  urgency: 'today' | 'this_week' | 'later';
  activity: 'email' | 'meeting' | 'focus' | 'other';
  client: string;
  sources: string[];
}

// ── SYSTEM PROMPT ──
const GENERATION_SYSTEM_PROMPT = `You are a prioritization assistant for a busy professional who runs a business with multiple clients and deals in flight simultaneously. You receive their actual content — unread emails (full body), recent meeting notes, and active CRM deals.

Your job is to SYNTHESIZE and GENERATE a comprehensive, prioritized action-item task list. Do NOT simply list each email, meeting, or deal as a separate task. Instead:

1. CONNECT related items across sources — an email + a deal + a meeting note about the same client combine into one synthesized task with full context.

2. EXTRACT commitments from meeting notes — if notes say "send SOW by Friday" or "follow up with pricing", create those tasks explicitly.

3. IDENTIFY urgency signals — unanswered emails (especially if someone has followed up), deals with approaching close dates, deals with no activity in 2+ weeks, action items from recent meetings.

4. SYNTHESIZE the "why now" — each task's context field must explain WHY this deserves attention today based on the actual signals you read across sources.

Each generated task must:
- Start with an action verb (Send, Schedule, Review, Follow up, Call, Complete, Draft, Confirm, etc.)
- Be specific — name the person, client, deal, or document
- Have 1-2 sentences of context drawn from the actual content (not generic advice)

Return a JSON array of up to 25 tasks, ranked by urgency and importance (most urgent first). Each object:
{
  "rank": number,           // 1-based position
  "title": string,          // Action item, max 70 chars
  "context": string,        // Why this matters now — 1-2 sentences from actual content
  "priority": "high" | "medium" | "low",
  "urgency": "today" | "this_week" | "later",
  "activity": "email" | "meeting" | "focus" | "other",
  "client": string,         // Client or company name (or "Internal" if not client-facing)
  "sources": string[]       // Which sources informed this task: any combo of ["gmail", "granola", "hubspot"]
}

Return ONLY the JSON array. No explanation, no markdown fences.`;

// ── BUILD RICH PROMPT ──
function buildRichPrompt(
  emails: RichEmail[],
  meetings: RichMeeting[],
  deals: RichDeal[],
  weeklyStrategy: string[]
): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const strategyBlock = weeklyStrategy.length === 3
    ? `**WEEKLY STRATEGY — top 3 priorities:**\n1. ${weeklyStrategy[0]}\n2. ${weeklyStrategy[1]}\n3. ${weeklyStrategy[2]}`
    : '**WEEKLY STRATEGY:** Not set.';

  // Gmail section
  const gmailBlock = emails.length === 0
    ? '(No unread emails)'
    : emails.map((e, i) =>
        `[EMAIL ${i + 1}]\nFROM: ${e.from}\nSUBJECT: ${e.subject}\nDATE: ${e.date}\n\n${e.body}`
      ).join('\n\n---\n\n');

  // Granola section
  const granolaBlock = meetings.length === 0
    ? '(No recent meeting notes)'
    : meetings.map((m, i) => {
        const dateLabel = m.date
          ? new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'Unknown date';
        const attendeesLine = m.attendees?.length
          ? `ATTENDEES: ${m.attendees.join(', ')}\n`
          : '';
        return `[MEETING ${i + 1}]\nTITLE: ${m.title}\nDATE: ${dateLabel}\n${attendeesLine}\n${m.notes}`;
      }).join('\n\n---\n\n');

  // HubSpot section
  const hubspotBlock = deals.length === 0
    ? '(No active deals)'
    : deals.map((d, i) => {
        const parts = [
          `[DEAL ${i + 1}]`,
          `NAME: ${d.name}`,
          `STAGE: ${d.stage}`,
          d.amount ? `VALUE: ${d.amount}` : null,
          d.closeDate ? `CLOSE DATE: ${d.closeDate}` : null,
          `LAST ACTIVITY: ${d.lastActivity}`,
          d.probability ? `PROBABILITY: ${d.probability}%` : null,
          d.description ? `\nNOTES: ${d.description}` : null,
        ].filter(Boolean);
        return parts.join('\n');
      }).join('\n\n---\n\n');

  return `Today is ${today}.

${strategyBlock}

${'═'.repeat(60)}
GMAIL — ${emails.length} unread email${emails.length !== 1 ? 's' : ''}
${'═'.repeat(60)}

${gmailBlock}

${'═'.repeat(60)}
GRANOLA — ${meetings.length} recent meeting note${meetings.length !== 1 ? 's' : ''}
${'═'.repeat(60)}

${granolaBlock}

${'═'.repeat(60)}
HUBSPOT — ${deals.length} active deal${deals.length !== 1 ? 's' : ''}
${'═'.repeat(60)}

${hubspotBlock}

Generate up to 25 action items. Return only a JSON array.`;
}

// ── RUN AI GENERATION ──
export async function runAIGeneration(
  emails: RichEmail[],
  meetings: RichMeeting[],
  deals: RichDeal[],
  weeklyStrategy: string[]
): Promise<AIGeneratedTask[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[ai] ANTHROPIC_API_KEY not set');
    return [];
  }

  const anthropic = new Anthropic({ apiKey });
  const userPrompt = buildRichPrompt(emails, meetings, deals, weeklyStrategy);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { text: string }).text)
    .join('');

  if (!text) return [];

  try {
    // Strip any accidental markdown fences
    const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((t) =>
        t.title &&
        t.context &&
        ['high', 'medium', 'low'].includes(t.priority) &&
        ['today', 'this_week', 'later'].includes(t.urgency) &&
        ['email', 'meeting', 'focus', 'other'].includes(t.activity)
      )
      .map((t, i) => ({
        rank: typeof t.rank === 'number' ? t.rank : i + 1,
        title: String(t.title).slice(0, 70),
        context: String(t.context),
        priority: t.priority as 'high' | 'medium' | 'low',
        urgency: t.urgency as 'today' | 'this_week' | 'later',
        activity: t.activity as 'email' | 'meeting' | 'focus' | 'other',
        client: String(t.client || 'Internal'),
        sources: Array.isArray(t.sources) ? t.sources.map(String) : [],
      }))
      .slice(0, 25);
  } catch (err) {
    console.error('[ai] Failed to parse generation response:', err);
    console.error('[ai] Raw response excerpt:', text.slice(0, 500));
    return [];
  }
}

// ── STORE GENERATED TASKS ──
// Uses raw SQL so this works before/after prisma generate.
// Requires: npx prisma db push to have created the generated_tasks table.
export async function storeGeneratedTasks(
  userEmail: string,
  tasks: AIGeneratedTask[],
  runId: string
): Promise<void> {
  try {
    // Delete old tasks for this user
    await prisma.$executeRaw`DELETE FROM generated_tasks WHERE user_email = ${userEmail}`;

    if (tasks.length === 0) return;

    for (const t of tasks) {
      const sourcesArray = `{${t.sources.map((s) => `"${s}"`).join(',')}}`;
      await prisma.$executeRaw`
        INSERT INTO generated_tasks (id, user_email, run_id, rank, title, context, priority, urgency, activity, client, sources, created_at)
        VALUES (
          gen_random_uuid()::text,
          ${userEmail},
          ${runId},
          ${t.rank},
          ${t.title},
          ${t.context},
          ${t.priority},
          ${t.urgency},
          ${t.activity},
          ${t.client},
          ${sourcesArray}::text[],
          NOW()
        )
      `;
    }
  } catch (err) {
    // Table may not exist yet — log and continue gracefully
    console.warn('[ai] storeGeneratedTasks failed (run npx prisma db push):', err instanceof Error ? err.message : err);
  }
}

// ── RETRIEVE GENERATED TASKS ──
export async function getGeneratedTasks(userEmail: string): Promise<(AIGeneratedTask & { id: string })[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      rank: number;
      title: string;
      context: string;
      priority: string;
      urgency: string;
      activity: string;
      client: string;
      sources: string[];
    }>>`
      SELECT id, rank, title, context, priority, urgency, activity, client, sources
      FROM generated_tasks
      WHERE user_email = ${userEmail}
      ORDER BY rank ASC
    `;

    return rows.map((r) => ({
      id: r.id,
      rank: r.rank,
      title: r.title,
      context: r.context,
      priority: r.priority as 'high' | 'medium' | 'low',
      urgency: r.urgency as 'today' | 'this_week' | 'later',
      activity: r.activity as 'email' | 'meeting' | 'focus' | 'other',
      client: r.client,
      sources: Array.isArray(r.sources) ? r.sources : [],
    }));
  } catch (err) {
    // Table may not exist yet
    console.warn('[ai] getGeneratedTasks failed (run npx prisma db push):', err instanceof Error ? err.message : err);
    return [];
  }
}

// ── LEGACY: scoring-based functions (kept for backward compat) ──

const LEGACY_SYSTEM_PROMPT = `You are a prioritization assistant for a busy professional. You receive tasks from Gmail, Granola (meeting notes), and HubSpot (deals). Your job is to:

1. **Cross-reference** — Connect related items across sources.
2. **Prioritize** — Rank tasks by urgency and importance.
3. **Suggest follow-ups** — Brief actionable follow-up suggestion (1–2 sentences).
4. **Output** — Return a JSON array. Each object: { "sourceId": string, "sourceType": "gmail"|"granola"|"hubspot", "priority": "high"|"medium"|"low", "score": number (0-100), "followUp": string|null }`;

function buildUserPrompt(tasks: Task[], weeklyStrategy: string[]): string {
  const strategy = weeklyStrategy.length === 3
    ? `**Weekly Strategy:**\n1. ${weeklyStrategy[0]}\n2. ${weeklyStrategy[1]}\n3. ${weeklyStrategy[2]}`
    : '**Weekly Strategy:** Not set.';

  const taskList = tasks
    .filter((t) => t.sourceId && t.sourceType)
    .map((t) => `- [${t.sourceType}] ${t.sourceId}: "${t.title}" | Client: ${t.client} | ${t.dueDate ? `Due: ${t.dueDate}` : 'No due date'} | ${(t.desc || '').slice(0, 150)}`);

  return `${strategy}\n\n**Tasks (${taskList.length}):**\n${taskList.join('\n')}\n\nReturn JSON array: sourceId, sourceType, priority, score, followUp.`;
}

export async function runAIAnalysis(
  userEmail: string,
  tasks: Task[],
  weeklyStrategy: string[]
): Promise<AITaskResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const analyzable = tasks.filter((t) => t.sourceId && t.sourceType);
  if (analyzable.length === 0) return [];

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: LEGACY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(tasks, weeklyStrategy) }],
  });

  const text = response.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { text: string }).text)
    .join('');

  if (!text) return [];

  try {
    const json = text.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(json) as AITaskResult[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p.sourceId != null && p.sourceType && ['high', 'medium', 'low'].includes(p.priority))
      .map((p) => ({
        ...p,
        sourceId: String(p.sourceId),
        sourceType: String(p.sourceType).toLowerCase() as 'gmail' | 'granola' | 'hubspot',
      }));
  } catch {
    return [];
  }
}

export async function storeAIResults(
  userEmail: string,
  results: AITaskResult[],
  runId: string
): Promise<void> {
  const now = new Date();
  for (const r of results) {
    await prisma.aITaskResult.upsert({
      where: { userEmail_taskId_source: { userEmail, taskId: r.sourceId, source: r.sourceType } },
      create: {
        userEmail, taskId: r.sourceId, source: r.sourceType,
        aiPriority: r.priority, aiScore: r.score, aiFollowUp: r.followUp,
        analyzedAt: now, runId,
      },
      update: {
        aiPriority: r.priority, aiScore: r.score, aiFollowUp: r.followUp,
        analyzedAt: now, runId,
      },
    });
  }
}

export async function getAIResults(userEmail: string): Promise<Map<string, AITaskResult>> {
  const rows = await prisma.aITaskResult.findMany({
    where: { userEmail },
    orderBy: { analyzedAt: 'desc' },
  });

  const map = new Map<string, AITaskResult>();
  for (const r of rows) {
    const key = `${String(r.source).toLowerCase()}:${String(r.taskId)}`;
    if (!map.has(key)) {
      map.set(key, {
        sourceId: r.taskId,
        sourceType: r.source as 'gmail' | 'granola' | 'hubspot',
        priority: r.aiPriority as 'high' | 'medium' | 'low',
        score: r.aiScore,
        followUp: r.aiFollowUp,
      });
    }
  }
  return map;
}
