import { AppError } from '../lib/errors';
import { isValidDateString } from '../lib/dates';

export function idParam(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'INVALID_ID', 'ID không hợp lệ.');
  }
  return id;
}

export function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

export function optionalQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function optionalQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new AppError(400, 'INVALID_QUERY', 'Tham số số không hợp lệ.');
  }
  return parsed;
}

export function queryDate(value: unknown, fieldName = 'date'): string | undefined {
  const raw = optionalQueryString(value);
  if (!raw) return undefined;
  if (!isValidDateString(raw)) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} phải có định dạng YYYY-MM-DD.`);
  }
  return raw;
}
