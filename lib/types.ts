// ── CORE TASK SCHEMA ──
// All sources (Superhuman, Granola, HubSpot) normalize into this shape.
// "source" is a human-readable label like "Superhuman · Today 9am".

export type SourceType = 'gmail' | 'granola' | 'hubspot';

export interface Task {
  id: number;
  title: string;
  desc: string;
  priority: 'high' | 'medium' | 'low';
  activity: 'email' | 'meeting' | 'focus' | 'other';
  client: string;
  project: string;
  source: string;
  dueDate: string | null; // ISO date string "YYYY-MM-DD" or null
  completed: boolean;
  manual: boolean;
  /** Canonical ID from source (message id, meeting id, deal id) — for AI result lookup */
  sourceId?: string;
  sourceType?: SourceType;
  /** AI-derived score (0–100) when analysis has run — overrides rules-based scoring */
  aiScore?: number;
  /** AI-suggested follow-up action when analysis has run */
  aiFollowUp?: string | null;
}

export type ViewType =
  | 'inbox'
  | 'priority'
  | 'activity'
  | 'client'
  | 'project'
  | 'date'
  | 'focus';

export type FilterType = 'priority' | 'activity' | 'client' | 'project' | 'date';

export interface FocusFilter {
  type: FilterType;
  value: string;
}

export type DateBucket =
  | 'Overdue'
  | 'Today'
  | 'Tomorrow'
  | 'This Week'
  | 'Later'
  | 'No Date';

// ── AI-GENERATED ACTION ITEMS ──
// Synthesized by Claude from Gmail + Granola + HubSpot content.
// These replace the raw source tasks in the Inbox view.
export interface GeneratedTask {
  id: string;             // Prisma cuid
  rank: number;           // 1-based sort position
  title: string;          // Actionable imperative ("Send revised pricing to Meridian")
  context: string;        // Why this matters now (1-2 sentences from cross-source analysis)
  priority: 'high' | 'medium' | 'low';
  urgency: 'today' | 'this_week' | 'later';
  activity: 'email' | 'meeting' | 'focus' | 'other';
  client: string;
  sources: string[];      // e.g. ["gmail", "hubspot"]
  completed?: boolean;    // Tracked in UI state, not persisted
}
