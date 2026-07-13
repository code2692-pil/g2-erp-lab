export type ValidationScope = "header" | "line" | "screen";

export interface ValidationIssue {
  scope: ValidationScope;
  message: string;
  rowKey?: string;
  field?: string;
}

export interface FieldValidationRule<T extends object> {
  field: Extract<keyof T, string>;
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  validate?: (value: T[Extract<keyof T, string>], row: T) => string | undefined;
}

export interface FieldValidationOptions {
  scope: Exclude<ValidationScope, "screen">;
  rowKey: string;
}

export type ValidationCellErrors = Readonly<Record<string, Readonly<Record<string, string>>>>;

function isEmpty(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "string" && !value.trim()) return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function validateFields<T extends object>(
  row: T,
  rules: readonly FieldValidationRule<T>[],
  options: FieldValidationOptions
) {
  const issues: ValidationIssue[] = [];

  for (const rule of rules) {
    const value = row[rule.field];
    let message: string | undefined;

    if (rule.required && isEmpty(value)) {
      message = `${rule.label}은(는) 필수 입력값입니다.`;
    } else if (rule.min !== undefined || rule.max !== undefined) {
      const numericValue = toFiniteNumber(value);
      if (numericValue === undefined) {
        message = `${rule.label}은(는) 숫자로 입력해야 합니다.`;
      } else if (rule.min !== undefined && numericValue < rule.min) {
        message = `${rule.label}은(는) ${rule.min} 이상이어야 합니다.`;
      } else if (rule.max !== undefined && numericValue > rule.max) {
        message = `${rule.label}은(는) ${rule.max} 이하여야 합니다.`;
      }
    }

    message ??= rule.validate?.(value, row);
    if (message) {
      issues.push({
        scope: options.scope,
        rowKey: options.rowKey,
        field: rule.field,
        message
      });
    }
  }

  return issues;
}

export function toValidationCellErrors(issues: readonly ValidationIssue[]): ValidationCellErrors {
  const cellErrors: Record<string, Record<string, string>> = {};

  for (const issue of issues) {
    if (!issue.rowKey || !issue.field) continue;
    const rowErrors = cellErrors[issue.rowKey] ?? {};
    rowErrors[issue.field] ??= issue.message;
    cellErrors[issue.rowKey] = rowErrors;
  }

  return cellErrors;
}

export function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
