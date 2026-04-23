export const MONTHLY_DUE_DAY = 5;

export type MonthlyDueApartment = {
  apartmentId: string;
  amount: number;
};

export type MonthlyDueCreationInput = {
  apartmentId: string;
  amount: number;
  dueDate: Date;
};

export type MonthlyDuesStore = {
  listApartmentsForDues: () => Promise<MonthlyDueApartment[]>;
  createMonthlyDues: (records: MonthlyDueCreationInput[]) => Promise<number>;
};

export function buildMonthlyDueDate(monthKey: string): Date {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month key. Expected YYYY-MM.");
  }

  return new Date(Date.UTC(year, month - 1, MONTHLY_DUE_DAY, 12, 0, 0, 0));
}

export function monthKeyFromDate(value: Date): string {
  return `${value.getUTCFullYear()}-${`${value.getUTCMonth() + 1}`.padStart(2, "0")}`;
}

export async function runMonthlyDuesGenerationJob(
  store: MonthlyDuesStore,
  input: { monthKey?: string; now?: Date } = {}
): Promise<{ monthKey: string; generatedCount: number }> {
  const now = input.now ?? new Date();
  const monthKey = input.monthKey ?? monthKeyFromDate(now);
  const dueDate = buildMonthlyDueDate(monthKey);
  const apartments = await store.listApartmentsForDues();

  if (apartments.length === 0) {
    return {
      monthKey,
      generatedCount: 0
    };
  }

  const generatedCount = await store.createMonthlyDues(
    apartments.map((apartment) => ({
      apartmentId: apartment.apartmentId,
      amount: apartment.amount,
      dueDate
    }))
  );

  return {
    monthKey,
    generatedCount
  };
}
