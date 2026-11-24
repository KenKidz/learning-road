import { translate, currentLocale } from '../i18n';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function localeTag(): string {
  return currentLocale() === 'vi' ? 'vi-VN' : 'en-US';
}

export function formatMinutes(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes ?? 0));
  if (total === 0) return translate('common.durationZero');
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return translate('common.durationMinutes', { count: rest });
  if (rest === 0) return translate('common.durationHours', { count: hours });
  return translate('common.durationHoursMinutes', { hours, minutes: rest });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = DATE_ONLY.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function todayInTimezone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return localDateString(new Date());
  }
}

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateString: string, amount: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  const diff = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

export function weekdayShort(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  return translate(`weekdays.d${date.getUTCDay()}`);
}

export function relativeDayLabel(dateString: string, today: string): string {
  if (dateString === today) return translate('common.today');
  if (dateString === addDays(today, -1)) return translate('common.yesterday');
  if (dateString === addDays(today, 1)) return translate('common.tomorrow');
  return `${weekdayShort(dateString)}, ${formatDate(dateString)}`;
}

export function localTimeString(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function combineDateTime(date: string, time: string): string {
  if (!date) return new Date().toISOString();
  const safeTime = time || '00:00';
  return new Date(`${date}T${safeTime}:00`).toISOString();
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function dateInTimezone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return localDateString(date);
  }
}
