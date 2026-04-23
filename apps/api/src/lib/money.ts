export function toMoney(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
}

export function sumMoney(values: number[]): number {
  return toMoney(values.reduce((total, value) => total + value, 0));
}
