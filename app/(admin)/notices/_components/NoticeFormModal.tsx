"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { createNotice, updateNotice } from "../../_lib/leaseCrmSupabase";
import type { Notice } from "../../_lib/leaseCrmTypes";

export default function NoticeFormModal({
  initial,
  createdBy,
  onClose,
  onSaved,
}: {
  initial: Notice | null;
  createdBy: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [isPinned, setIsPinned] = useState(initial?.isPinned ?? false);
  const [isImportant, setIsImportant] = useState(initial?.isImportant ?? false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const c = content.trim();
    if (!t) {
      toast.error("제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateNotice(initial.id, {
          title: t,
          content: c,
          isPinned,
          isImportant,
        });
      } else {
        await createNotice({
          title: t,
          content: c,
          createdBy,
          isPinned,
          isImportant,
        });
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="crm-modal-panel w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal
        >
          <div className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-50">
            {initial ? "공지 수정" : "공지 작성"}
          </div>
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-[14px] font-medium text-zinc-500">제목</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="crm-field w-full"
                placeholder="공지 제목"
                maxLength={200}
              />
            </div>
            <div>
              <label className="mb-1 block text-[14px] font-medium text-zinc-500">내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="crm-field w-full resize-y"
                placeholder="공지 내용"
              />
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-slate-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="size-4 rounded border-slate-300 text-[var(--crm-blue-deep)]"
                />
                상단 고정
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-slate-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={(e) => setIsImportant(e.target.checked)}
                  className="size-4 rounded border-slate-300 text-[var(--crm-blue-deep)]"
                />
                중요 공지 (강조 표시)
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="crm-btn-secondary text-[14px]" disabled={saving}>
                취소
              </button>
              <button type="submit" className="crm-btn-primary text-[14px] disabled:opacity-50" disabled={saving}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
