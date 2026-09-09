"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AuthProvider, type SessionUser } from "./AuthContext";
import { LogoMark } from "@/components/brand/LogoMark";
import styles from "./auth.module.css";

type AuthState =
  | { status: "checking" }
  | { status: "authenticated"; user: SessionUser }
  | { status: "unavailable" };

async function fetchSessionState(): Promise<AuthState | { status: "unauthorized" }> {
  try {
    const response = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    });

    if (response.ok) {
      const payload = await response.json() as { user: SessionUser };
      return { status: "authenticated", user: payload.user };
    }

    return response.status === 401
      ? { status: "unauthorized" }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  function retry() {
    setState({ status: "checking" });
    setAttempt((current) => current + 1);
  }

  useEffect(() => {
    let active = true;

    void fetchSessionState().then((nextState) => {
      if (!active) {
        return;
      }

      if (nextState.status === "unauthorized") {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      setState(nextState);
    });

    return () => {
      active = false;
    };
  }, [attempt, pathname, router]);

  if (state.status === "authenticated") {
    return <AuthProvider user={state.user}>{children}</AuthProvider>;
  }

  if (state.status === "unavailable") {
    return (
      <main className={styles.statusPage}>
        <section className={styles.statusPanel}>
          <LogoMark className={styles.logo} title="Estate CRM" />
          <h1>CRM временно недоступна</h1>
          <p>Не удалось проверить подключение к серверу. Попробуйте ещё раз.</p>
          <button type="button" onClick={retry}>Повторить</button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.statusPage} aria-live="polite">
      <span className={styles.loader} aria-label="Проверяем сессию" />
    </main>
  );
}
