/**
 * Date helpers. Deadlines are date-only strings, so everything is anchored to
 * UTC noon to keep day arithmetic stable regardless of the student's timezone.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfDay(timestamp: number): Date {
  const date = new Date(timestamp);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0));
}

export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.round((parseDate(iso).getTime() - startOfDay(now).getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Annual scholarships whose date has passed are rolled to next year's cycle so
 * a student planning ahead still sees them.
 */
export function effectiveDeadline(iso: string, recurring: boolean, now: number = Date.now()): string {
  if (!recurring || daysUntil(iso, now) >= 0) return iso;
  const date = parseDate(iso);
  const today = startOfDay(now);
  let year = date.getUTCFullYear();
  while (Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), 12) < today.getTime()) {
    year += 1;
  }
  return toISODate(new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), 12)));
}

export function formatDeadline(iso: string, now: number = Date.now()): string {
  const days = daysUntil(iso, now);
  const pretty = parseDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (days < 0) return `${pretty} (closed)`;
  if (days === 0) return `${pretty} (today)`;
  if (days === 1) return `${pretty} (tomorrow)`;
  return `${pretty} (${days} days)`;
}
