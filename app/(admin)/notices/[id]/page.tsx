"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchNoticeById } from "../../_lib/leaseCrmSupabase";
import type { Notice } from "../../_lib/leaseCrmTypes";
import { listActiveUsers } from "../../_lib/usersSupabase";

function formatNoticeDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function NoticeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState("—");

  const load = useCallback(async () => {
    if (!id) {
      setNotice(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const n = await fetchNoticeById(id);
      setNotice(n);
      if (n) {
        const users = await listActiveUsers();
        const hit = users.find((u) => u.id === n.createdBy);
        setAuthorName(hit?.name ?? "작성자");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "불러오지 못했습니다.");
      setNotice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-[15px] text-slate-500">불러오는 중…</div>
    );
  }

  if (!notice) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-[16px] font-medium text-slate-700 dark:text-zinc-200">공지를 찾을 수 없습니다.</p>
        <Link href="/notices" className="text-[15px] font-semibold text-[var(--crm-blue)] underline">
          공지 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-[15px] font-semibold text-[var(--crm-blue)] hover:underline dark:text-sky-300"
      >
        ← 뒤로
      </button>

      <article
        className={cn(
          "rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[var(--crm-shadow-sm)] sm:p-8 dark:border-zinc-800 dark:bg-zinc-950",
          notice.isPinned && "ring-2 ring-[var(--crm-blue)]/20 dark:ring-sky-500/25"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {notice.isPinned ? (
            <span className="rounded-full bg-[var(--crm-blue-deep)] px-2.5 py-0.5 text-[12px] font-bold text-white">
              고정
            </span>
          ) : null}
          {notice.isImportant ? (
            <span className="rounded-full bg-amber-200/90 px-2.5 py-0.5 text-[12px] font-bold text-amber-950 dark:bg-amber-500/30 dark:text-amber-100">
              중요
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-50">
          {notice.title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-slate-500 dark:text-zinc-400">
          <span>{authorName}</span>
          <span>{formatNoticeDate(notice.createdAt)}</span>
        </div>
        <div className="mt-8 whitespace-pre-wrap text-[16px] leading-relaxed text-slate-800 dark:text-zinc-200">
          {notice.content}
        </div>
      </article>

      <div className="text-center">
        <Link
          href="/notices"
          className="inline-flex text-[15px] font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
        >
          전체 공지사항
        </Link>
      </div>
    </div>
  );
}
