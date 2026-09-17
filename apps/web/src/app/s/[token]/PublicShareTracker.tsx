"use client";

import { useEffect } from "react";

export function PublicShareTracker({ token }: { token: string }) {
  useEffect(() => {
    void fetch(`/api/public/property-shares/${token}`, { method: "POST", keepalive: true });
  }, [token]);
  return null;
}
