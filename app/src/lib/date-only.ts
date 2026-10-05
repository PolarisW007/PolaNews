/**
 * Normalize a PostgreSQL DATE value without converting local midnight to UTC.
 *
 * node-postgres can return DATE as either a date-only string or a Date depending
 * on parser configuration. Calendar dates must use local date fields when a
 * Date/ISO timestamp is received; `toISOString().slice(0, 10)` can move an
 * Asia/Shanghai midnight to the previous UTC day.
 */
export function normalizeDateOnly(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : formatLocalDate(parsed);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : formatLocalDate(value);
  }

  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : formatLocalDate(parsed);
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
