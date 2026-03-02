// ── CORE TASK SCHEMA ──
// All sources (Superhuman, Granola, HubSpot) normalize into this shape.
// "source" is a human-readable label like "Superhuman · Today 9am".

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
}

export type ViewType =
  | 'inbox'
  | 'priority'
  | 'activity'
  | 'client'
  | 'project'
  | 'date'
  | 'focus';

export type FilterType = 'priority' | 'activity' | 'client' | 'project';

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
