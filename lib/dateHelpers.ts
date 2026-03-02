import type { DateBucket } from './types';

export function getDateBucket(dueDate: string | null): DateBucket {
  if (!dueDate) return 'No Date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const due = new Date(dueDate + 'T00:00:00');
  if (due < today) return 'Overdue';
  if (due.getTime() === today.getTime()) return 'Today';
  if (due.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (due <= weekEnd) return 'This Week';
  return 'Later';
}

export const DATE_BUCKET_ORDER: DateBucket[] = [
  'Overdue',
  'Today',
  'Tomorrow',
  'This Week',
  'Later',
  'No Date',
];

export const DATE_BUCKET_ICON: Record<DateBucket, string> = {
  Overdue: 'error_outline',
  Today: 'today',
  Tomorrow: 'wb_twilight',
  'This Week': 'date_range',
  Later: 'schedule',
  'No Date': 'remove_circle_outline',
};
