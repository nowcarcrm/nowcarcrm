"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { useSocket } from "@/app/_components/realtime/SocketProvider";
import { REALTIME_EVENTS } from "@/app/_lib/realtimeEvents";
import type { AppNotification } from "@/app/_lib/notificationTypes";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";

type NotificationsContextValue = {
  items: AppNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteOne: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue>({
  items: [],
  unreadCount: 0,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  deleteOne: async () => {},
  deleteAll: async () => {},
});

type ToastItem = AppNotification & { closing?: boolean };

function formatRelative(createdAt: string) {
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hour = Math.floor(diffMin / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

function playShortBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.03;
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* ignore */
  }
}

function rowToAppNotification(row: Record<string, unknown>): AppNotification | null {
  const id = row.id != null ? String(row.id) : "";
  const user_id = row.user_id != null ? String(row.user_id) : "";
  if (!id || !user_id) return null;
  const raw = row.type;
  const type: AppNotification["type"] =
    raw === "new-lead-assigned" ||
    raw === "lead-reassigned" ||
    raw === "ai-alert" ||
    raw === "notification"
      ? raw
      : "notification";
  return {
    id,
    user_id,
    type,
    title: typeof row.title === "string" ? row.title : "",
    message: typeof row.message === "string" ? row.message : "",
    data: row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {},
    is_read: row.is_read === true,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function NotificationToastStack({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <div className="fixed bottom-6 right-6 z-[80] flex w-[360px] max-w-[calc(100vw-1.5rem)] flex-col gap-3">
      {toasts.map((toast) => {
        const data = (toast.data ?? {}) as { leadId?: string; customerNameMasked?: string; carModel?: string; source?: string; assignedBy?: string; aiSummary?: string };
        return (
          <div
            key={toast.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_16px_38px_rgba(15,23,42,0.18)] dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="text-sm font-semibold">{toast.title || "📋 신규 디비가 배포되었습니다!"}</div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              {data.customerNameMasked ?? "고객"} · {data.carModel ?? "-"} · {data.source ?? "-"}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              배포자 {data.assignedBy ?? "-"} · {formatRelative(toast.created_at)}
            </div>
            <div className="mt-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-xs dark:bg-zinc-800">
              🤖 {data.aiSummary ?? "신규 고객은 빠른 1차 응대가 전환에 유리합니다."}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs dark:border-zinc-600"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={() => {
                  dismiss(toast.id);
                  if (data.leadId) router.push(`/leads/counseling-progress?leadId=${data.leadId}`);
                }}
                className="rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                바로 확인하기
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DISPATCH_POLL_MS = 6000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { socket } = useSocket();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
    }
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("/sw.js");
      console.log("[notifications] service worker registered");
    } catch (error) {
      console.error("[notifications] service worker registration failed", error);
    }
  }, []);

  const showDesktopNotification = useCallback(async (notification: AppNotification) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const data = (notification.data ?? {}) as { leadId?: string };
      const targetUrl = data.leadId
        ? `/leads/counseling-progress?leadId=${encodeURIComponent(data.leadId)}`
        : "/dashboard";
      await reg.showNotification(notification.title || "나우카 CRM", {
        body: notification.message || "새로운 알림이 있습니다.",
        icon: "/images/nowcar-logo.svg",
        badge: "/images/nowcar-logo.svg",
        tag: notification.id,
        requireInteraction: true,
        data: { url: targetUrl },
      });
    } catch (error) {
      console.error("[notifications] desktop notification failed", error);
    }
  }, []);

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/notifications?limit=20", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { items?: AppNotification[]; unreadCount?: number };
    if (res.ok) {
      setItems(json.items ?? []);
      setServerUnreadCount(json.unreadCount ?? 0);
    }
  }, [getToken]);

  const applyNotificationFromStream = useCallback(
    (notification: AppNotification) => {
      let added = false;
      setItems((prev) => {
        if (prev.some((i) => i.id === notification.id)) return prev;
        added = true;
        return [notification, ...prev].slice(0, 20);
      });
      if (!added) return;
      setServerUnreadCount((c) => c + 1);
      setToasts((prev) =>
        prev.some((t) => t.id === notification.id) ? prev : [notification, ...prev].slice(0, 3)
      );
      playShortBeep();
      if (typeof window !== "undefined" && document.hidden) {
        void showDesktopNotification(notification);
      }
    },
    [showDesktopNotification]
  );

  const markRead = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/notifications/${id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      setServerUnreadCount((prev) => Math.max(0, prev - 1));
    },
    [getToken]
  );

  const markAllRead = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    await fetch("/api/notifications/read-all", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setServerUnreadCount(0);
  }, [getToken]);

  const deleteOne = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      setServerUnreadCount((prev) => Math.max(0, prev - (items.find((item) => item.id === id && !item.is_read) ? 1 : 0)));
    },
    [getToken, items]
  );

  const deleteAll = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    await fetch("/api/notifications/all", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setItems([]);
    setToasts([]);
    setServerUnreadCount(0);
  }, [getToken]);

  useEffect(() => {
    void registerServiceWorker();
  }, [registerServiceWorker]);

  useEffect(() => {
    if (!profile?.userId) return;
    void requestBrowserPermission();
    void refresh();
  }, [profile?.userId, refresh, requestBrowserPermission]);

  useEffect(() => {
    if (!socket) return;
    const onNotification = (notification: AppNotification) => {
      applyNotificationFromStream(notification);
    };
    socket.on(REALTIME_EVENTS.NOTIFICATION, onNotification);
    return () => {
      socket.off(REALTIME_EVENTS.NOTIFICATION, onNotification);
    };
  }, [socket, applyNotificationFromStream]);

  /** Serverless: postgres_changes on notifications (RLS limits visible INSERTs). */
  useEffect(() => {
    if (!profile?.userId) return;

    const channel = supabase
      .channel(`notifications:${profile.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const row = rowToAppNotification(payload.new as Record<string, unknown>);
          if (!row || row.user_id !== profile.userId) return;
          applyNotificationFromStream(row);
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" && process.env.NODE_ENV === "development") {
          console.warn("[notifications] realtime channel error", err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.userId, applyNotificationFromStream]);

  /** API poll fallback for dispatch toasts when Realtime is unavailable. */
  useEffect(() => {
    if (!profile?.userId) return;

    let cancelled = false;
    let initialPollDone = false;
    const knownIds = new Set<string>();

    const tick = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const res = await fetch("/api/notifications?limit=15", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { items?: AppNotification[] };
      if (!res.ok || cancelled) return;
      const list = json.items ?? [];

      if (!initialPollDone) {
        for (const item of list) knownIds.add(item.id);
        initialPollDone = true;
        return;
      }

      for (const item of [...list].reverse()) {
        if (knownIds.has(item.id)) continue;
        knownIds.add(item.id);
        if (item.type !== "new-lead-assigned" && item.type !== "lead-reassigned") continue;
        applyNotificationFromStream(item);
      }
    };

    const intervalId = window.setInterval(() => void tick(), DISPATCH_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [profile?.userId, getToken, applyNotificationFromStream]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts]);

  const unreadCount = useMemo(() => Math.max(serverUnreadCount, items.filter((item) => !item.is_read).length), [items, serverUnreadCount]);
  const value = useMemo(
    () => ({ items, unreadCount, refresh, markRead, markAllRead, deleteOne, deleteAll }),
    [items, unreadCount, refresh, markRead, markAllRead, deleteOne, deleteAll]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationToastStack toasts={toasts} dismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}

export function NotificationCenterDropdown() {
  const router = useRouter();
  const { items, markRead, markAllRead, deleteOne, deleteAll } = useNotifications();

  return (
    <div className="absolute right-0 top-11 z-40 w-[360px] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between px-2 pt-1">
        <div className="text-sm font-semibold">알림센터</div>
        <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-sky-600">
          모두 읽음
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("전체 알림을 삭제하시겠습니까?")) {
              void deleteAll();
            }
          }}
          className="text-xs font-semibold text-rose-600"
        >
          모두 삭제
        </button>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-zinc-500">알림이 없습니다.</div>
        ) : (
          items.map((item) => {
            const data = (item.data ?? {}) as { leadId?: string };
            return (
              <div
                key={item.id}
                className={`group flex items-start gap-2 rounded-lg px-2 py-2 text-left transition-opacity duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  item.is_read ? "" : "bg-sky-50/70 dark:bg-sky-500/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    void markRead(item.id);
                    if (data.leadId) router.push(`/leads/counseling-progress?leadId=${data.leadId}`);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <span className="mt-1 text-sm">{item.type === "ai-alert" ? "🤖" : "🔔"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{item.message}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-400">{formatRelative(item.created_at)}</span>
                  </span>
                  {!item.is_read ? <span className="mt-1 size-2 rounded-full bg-sky-500" /> : null}
                </button>
                <button
                  type="button"
                  aria-label="알림 삭제"
                  onClick={() => void deleteOne(item.id)}
                  className="invisible rounded-md px-1.5 py-1 text-xs text-rose-600 hover:bg-rose-50 group-hover:visible"
                >
                  🗑️
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-2 border-t border-zinc-200 px-2 pt-2 text-right text-xs dark:border-zinc-700">
        <Link href="/dashboard" className="font-semibold text-sky-600">
          전체 알림 보기 →
        </Link>
      </div>
    </div>
  );
}
