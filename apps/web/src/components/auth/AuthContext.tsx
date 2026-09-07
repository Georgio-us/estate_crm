"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    role: "ADMIN" | "LEAD" | "MANAGER";
  };
}

const AuthContext = createContext<SessionUser | null>(null);

export function AuthProvider({ children, user }: { children: ReactNode; user: SessionUser }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): SessionUser {
  const user = useContext(AuthContext);

  if (!user) {
    throw new Error("useCurrentUser must be used inside AuthProvider");
  }

  return user;
}
