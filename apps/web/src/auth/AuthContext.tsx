import type { AuthSession, User } from "@asys/contracts";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { fetchCurrentSession, logout as apiLogout } from "./api";
import { loadSessionFromStorage, saveSessionToStorage } from "./storage";

type AuthContextValue = {
  session: AuthSession | null;
  user: User | null;
  setSession: (session: AuthSession) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(() => loadSessionFromStorage());

  useEffect(() => {
    if (!session) {
      return;
    }

    let isCancelled = false;

    void fetchCurrentSession(session.accessToken)
      .then((activeSession) => {
        if (isCancelled) {
          return;
        }

        setSessionState(activeSession);
        saveSessionToStorage(activeSession);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setSessionState(null);
        saveSessionToStorage(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [session?.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      setSession(nextSession) {
        setSessionState(nextSession);
        saveSessionToStorage(nextSession);
      },
      async logout() {
        const accessToken = session?.accessToken;
        if (accessToken) {
          await apiLogout(accessToken).catch(() => undefined);
        }
        setSessionState(null);
        saveSessionToStorage(null);
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth sadece AuthProvider altinda kullanilabilir");
  }

  return context;
}
