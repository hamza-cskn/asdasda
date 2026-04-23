import { authSessionSchema } from "@asys/contracts";
import type { AuthSession } from "@asys/contracts";

const STORAGE_KEY = "asys-auth-session";

export function loadSessionFromStorage(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return authSessionSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function saveSessionToStorage(session: AuthSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
