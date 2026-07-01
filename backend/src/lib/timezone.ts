export const APP_TIMEZONE = process.env.TZ ?? 'Asia/Dushanbe';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getParts(d: Date, timeZone = APP_TIMEZONE): DateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour') % 24,
    minute: pick('minute'),
    second: pick('second'),
  };
}

export function localDayKey(d: Date): string {
  const { year, month, day } = getParts(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getLocalHour(d: Date): number {
  return getParts(d).hour;
}

export function startOfLocalDay(date: Date): Date {
  const { year, month, day } = getParts(date);

  for (let h = -14; h <= 14; h++) {
    const candidate = new Date(Date.UTC(year, month - 1, day, h, 0, 0, 0));
    const p = getParts(candidate);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0) {
      return candidate;
    }
  }

  return new Date(date);
}

export function endOfLocalDay(date: Date): Date {
  return new Date(startOfLocalDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function addLocalDays(date: Date, days: number): Date {
  const start = startOfLocalDay(date);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatLocalDateTime(d: Date): string {
  return d.toLocaleString('ru-RU', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** YYYY-MM-DD из input[type=date] */
export function parseLocalDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}
