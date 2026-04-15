"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";
import { authErrorMessageKo } from "@/app/_lib/authErrorMessages";

function safeInternalPath(raw: string | null, fallback: string): string {
  const t = (raw ?? fallback).trim();
  if (!t.startsWith("/") || t.startsWith("//")) return fallback;
  return t;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeSearchParams = searchParams ?? new URLSearchParams();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("인증을 처리하는 중…");

  useEffect(() => {
    const next = safeInternalPath(safeSearchParams.get("next"), "/reset-password");
    const code = safeSearchParams.get("code");
    const err =
      safeSearchParams.get("error_description")?.replace(/\+/g, " ") ??
      safeSearchParams.get("error");

    if (err) {
      queueMicrotask(() => {
        setStatus("error");
        try {
          setMessage(authErrorMessageKo(decodeURIComponent(err)));
        } catch {
          setMessage(authErrorMessageKo(err));
        }
      });
      return;
    }

    if (!code) {
      queueMicrotask(() => {
        setStatus("error");
        setMessage("인증 코드가 없습니다. 비밀번호 재설정 메일의 링크를 다시 사용해 주세요.");
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) {
        setStatus("error");
        setMessage(authErrorMessageKo(error.message));
        return;
      }
      router.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, safeSearchParams]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      {status === "working" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : (
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">인증 실패</h1>
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{message}</p>
          <div className="mt-6 flex flex-col gap-2 text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              비밀번호 재설정 다시 요청
            </Link>
            <Link href="/login" className="text-zinc-600 hover:underline dark:text-zinc-400">
              로그인으로 돌아가기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">인증을 처리하는 중…</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
