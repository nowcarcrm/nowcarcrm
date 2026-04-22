"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";

export type SidebarCountKey =
  | "new"
  | "counseling"
  | "unresponsive"
  | "contract"
  | "delivered"
  | "hold"
  | "cancel";

export type SidebarCounts = Record<SidebarCountKey, number>;

const EMPTY: SidebarCounts = {
  new: 0,
  counseling: 0,
  unresponsive: 0,
  contract: 0,
  delivered: 0,
  hold: 0,
  cancel: 0,
};

export function useSidebarCounts(): SidebarCounts {
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY);

  const fetchCounts = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/leads/sidebar-counts", {
        cache: "no-store",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<SidebarCounts>;
      setCounts({
        new: Number(data.new ?? 0),
        counseling: Number(data.counseling ?? 0),
        unresponsive: Number(data.unresponsive ?? 0),
        contract: Number(data.contract ?? 0),
        delivered: Number(data.delivered ?? 0),
        hold: Number(data.hold ?? 0),
        cancel: Number(data.cancel ?? 0),
      });
    } catch {
      // silent fail: keep previous values
    }
  }, []);

  useEffect(() => {
    void fetchCounts();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchCounts();
      }
    }, 5000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchCounts();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchCounts]);

  return counts;
}
