"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { deleteNotice, listNotices } from "../_lib/leaseCrmSupabase";
import type { Notice } from "../_lib/leaseCrmTypes";
import { listActiveUsers } from "../_lib/usersSupabase";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import NoticeFormModal from "./_components/NoticeFormModal";

function formatNoticeDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function NoticesPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorById, setAuthorById] = useState<Map<string, string>>(new Map());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, users] = await Promise.all([listNotices(200), listActiveUsers()]);
      setNotices(list);
      const m = new Map<string, string>();
      for (const u of users) {
        m.set(u.id, u.name);
      }
      setAuthorById(m);
    } catch (e) {
      setNotices([]);
      toast.error(e instanceof Error ? e.message : "공지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) return;
    void load();
  }, [profile, authLoading, load]);

  const authorName = useCallback(
    (n: Notice) => authorById.get(n.createdBy) ?? "작성자",
    [authorById]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(n: Notice) {
    setEditing(n);
    setFormOpen(true);
  }

  async function handleDelete(n: Notice) {
    if (!isAdmin) return;
    const ok = window.confirm(`「${n.title}」공지를 삭제할까요?`);
    if (!ok) return;
    try {
      await deleteNotice(n.id);
      toast.success("공지를 삭제했습니다.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 border-b border-slate-200/90 pb-6 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-accent-muted)]">운영</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-50">공지사항</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-slate-600 dark:text-zinc-400">
            회사 전체 공지입니다. 고정·중요 표시는 목록과 대시보드에서 강조됩니다.
          </p>
        </div>
        {isAdmin ? (
          <button type="button" onClick={openCreate} className="crm-btn-primary shrink-0 px-5 py-2.5 text-[15px]">
            공지 작성
          </button>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[var(--crm-shadow-sm)] dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <div className="px-6 py-16 text-center text-[15px] text-slate-500">불러오는 중…</div>
        ) : notices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[16px] font-medium text-slate-700 dark:text-zinc-200">등록된 공지가 없습니다.</p>
            {isAdmin ? (
              <button type="button" onClick={openCreate} className="crm-btn-primary mt-4">
                첫 공지 작성
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {notices.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "transition-colors hover:bg-slate-50/90 dark:hover:bg-zinc-900/40",
                  n.isPinned && "bg-[#f0f4fa]/90 dark:bg-sky-950/25",
                  n.isImportant && !n.isPinned && "bg-amber-50/40 dark:bg-amber-500/5"
                )}
              >
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <Link href={`/notices/${n.id}`} className="min-w-0 flex-1 group">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.isPinned ? (
                        <span className="rounded-full bg-[var(--crm-blue-deep)] px-2.5 py-0.5 text-[12px] font-bold text-white dark:bg-sky-600">
                          고정
                        </span>
                      ) : null}
                      {n.isImportant ? (
                        <span className="rounded-full bg-amber-200/90 px-2.5 py-0.5 text-[12px] font-bold text-amber-950 dark:bg-amber-500/30 dark:text-amber-100">
                          중요
                        </span>
                      ) : null}
                      <span className="text-[16px] font-semibold text-slate-900 group-hover:underline dark:text-zinc-50">
                        {n.title}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
                      {n.content}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-slate-500 dark:text-zinc-500">
                      <span>{authorName(n)}</span>
                      <span>{formatNoticeDate(n.createdAt)}</span>
                    </div>
                  </Link>
                  {isAdmin ? (
                    <div className="flex shrink-0 gap-2 sm:flex-col sm:items-stretch">
                      <button
                        type="button"
                        onClick={() => openEdit(n)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold text-slate-800 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(n)}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[14px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200"
                      >
                        삭제
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formOpen && profile ? (
        <NoticeFormModal
          key={editing?.id ?? "new"}
          initial={editing}
          createdBy={profile.userId}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={async () => {
            toast.success(editing ? "공지를 수정했습니다." : "공지를 등록했습니다.");
            setFormOpen(false);
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
