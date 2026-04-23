import { toMoney } from "./money.js";

export const MONTHLY_DUE_DAY = 5;
export const MONTHLY_LATE_FEE_RATE = 0.02;

export function buildDueDateForMonth(month: string): Date {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("Invalid month. Expected YYYY-MM.");
  }

  return new Date(Date.UTC(year, monthIndex, MONTHLY_DUE_DAY, 12, 0, 0, 0));
}

export function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function calculateOverdueMonthCount(dueDate: Date, asOf: Date = new Date()): number {
  if (asOf.getTime() <= dueDate.getTime()) {
    return 0;
  }

  const monthDifference =
    (asOf.getUTCFullYear() - dueDate.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - dueDate.getUTCMonth());

  return Math.max(1, monthDifference + 1);
}

export function calculateLateFee(amount: number, dueDate: Date, asOf: Date = new Date()): number {
  return toMoney(amount * MONTHLY_LATE_FEE_RATE * calculateOverdueMonthCount(dueDate, asOf));
}

export function defaultCurrentMonth(now: Date = new Date()): string {
  return monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0, 0)));
}
