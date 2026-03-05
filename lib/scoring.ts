import type { Task } from './types';
import { getDateBucket } from './dateHelpers';

export const INBOX_LIMIT = 25;

// ── INBOX SCORING ──
// Ranks tasks by urgency, priority, and strategy alignment.
// Strategy items are passed in (no DOM access) so this works server-side too.
// In production: replace with a Claude API call that scores tasks using
// full context — email body, deal notes, meeting transcript snippets.

export function scoreTask(task: Task, strategyItems: string[]): number {
  // Prefer AI score when available
  if (typeof task.aiScore === 'number') return task.aiScore;

  let score = 0;

  // Priority weight
  if (task.priority === 'high') score += 40;
  else if (task.priority === 'medium') score += 20;
  else score += 5;

  // Due date urgency
  const bucket = getDateBucket(task.dueDate);
  if (bucket === 'Overdue') score += 50;
  else if (bucket === 'Today') score += 35;
  else if (bucket === 'Tomorrow') score += 18;
  else if (bucket === 'This Week') score += 8;
  else if (bucket === 'Later') score += 2;

  // Activity type — meetings are time-anchored, emails need timely response
  if (task.activity === 'meeting') score += 8;
  else if (task.activity === 'email') score += 5;

  // Strategy alignment bonus
  const strategyText = strategyItems.join(' ').toLowerCase();
  if (
    strategyText.includes(task.client.toLowerCase()) ||
    strategyText.includes(task.project.toLowerCase())
  ) {
    score += 25;
  }

  return score;
}

export function getInboxTasks(tasks: Task[], strategyItems: string[]): Task[] {
  return tasks
    .filter((t) => !t.completed)
    .map((t) => ({ task: t, score: scoreTask(t, strategyItems) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, INBOX_LIMIT)
    .map((x) => x.task);
}

// ── AI INSIGHT ENGINE ──
// Rules-based version. Replace generateInsight() body with a Claude API call
// once the real integrations are live — pass tasks + strategy as context.

export function generateInsight(tasks: Task[], strategyItems: string[]): string {
  const open = tasks.filter((t) => !t.completed);
  const high = open.filter((t) => t.priority === 'high');
  const meetings = open.filter((t) => t.activity === 'meeting');
  const focusTasks = open.filter((t) => t.activity === 'focus');
  const stale = open.filter(
    (t) =>
      t.source.toLowerCase().includes('stale') ||
      t.source.toLowerCase().includes('days ago')
  );
  const topStrategy = strategyItems[0] || null;

  const insights: string[] = [];

  // Pattern: high-priority item + upcoming meeting for same client
  high.forEach((h) => {
    const relatedMeeting = meetings.find((m) => m.client === h.client);
    if (relatedMeeting) {
      insights.push(
        `You have a meeting coming up with ${h.client} — and "${h.title.toLowerCase()}" is still open. ` +
          `That call is your best window to resolve both. Don't let the prep slip.`
      );
    }
  });

  // Pattern: focus tasks competing with high-priority deadline work
  if (focusTasks.length > 0 && high.length > 0) {
    const focus = focusTasks[0];
    const urgent = high[0];
    if (focus.client !== urgent.client) {
      insights.push(
        `"${focus.title}" needs protected time this week — ` +
          `but ${urgent.client} is your highest-leverage open item right now. ` +
          `Block the focus work for later in the week so the urgent work lands first.`
      );
    }
  }

  // Pattern: stale deals / no-response follow-ups
  if (stale.length > 0) {
    const s = stale[0];
    insights.push(
      `${s.client} has gone quiet. "${s.title}" has been sitting without movement — ` +
        `a short, direct follow-up today is lower cost than losing the deal later.`
    );
  }

  // Pattern: strategy alignment check
  if (topStrategy && high.length > 0) {
    const aligned = high.find((t) => {
      const s = topStrategy.toLowerCase();
      return (
        s.includes(t.client.toLowerCase()) ||
        s.includes(t.project.toLowerCase())
      );
    });
    if (aligned) {
      insights.push(
        `Your top priority this week — "${topStrategy}" — maps directly to "${aligned.title}". ` +
          `That's the right thread to pull. Don't let lower-priority items crowd it out before Thursday.`
      );
    }
  }

  if (insights.length === 0) {
    insights.push(
      `You have ${open.length} open items, ${high.length} of them high priority. ` +
        `Your clearest path forward is to clear the high-priority work before taking on anything new.`
    );
  }

  return insights[0];
}
