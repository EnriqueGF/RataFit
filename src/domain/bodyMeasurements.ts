/** Una medición por fecha local; el peso se guarda siempre en kg. */
export interface BodyMeasurement {
  date: string;
  weight: number;
  bodyFat?: number;
}

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isBodyMeasurement(value: unknown): value is BodyMeasurement {
  if (!value || typeof value !== 'object') return false;
  const m = value as BodyMeasurement;
  return typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date)
    && Number.isFinite(Date.parse(m.date)) && new Date(m.date).toISOString().slice(0, 10) === m.date
    && typeof m.weight === 'number' && Number.isFinite(m.weight) && m.weight > 0 && m.weight <= 1000
    && (m.bodyFat === undefined || (typeof m.bodyFat === 'number' && Number.isFinite(m.bodyFat) && m.bodyFat > 0 && m.bodyFat < 100));
}

export function normalizeMeasurements(value: unknown): BodyMeasurement[] {
  if (!Array.isArray(value)) return [];
  return [...new Map(value.filter(isBodyMeasurement).map(m => [m.date, m])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
}
