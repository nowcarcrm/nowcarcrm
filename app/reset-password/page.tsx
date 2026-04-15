"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";
import { authErrorMessageKo } from "@/app/_lib/authErrorMessages";

function parseHashParams(hash: string): Record<string, string> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function tokensFromUrl(): { access_token: string; refresh_token: string } | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  let access_token = search.get("access_token")?.trim() ?? "";
  let refresh_token = search.get("refresh_token")?.trim() ?? "";
  if (!access_token || !refresh_token) {
    const fromHash = parseHashParams(window.location.hash);
    access_token = fromHash.access_token?.trim() ?? "";
    refresh_token = fromHash.refresh_token?.trim() ?? "";
  }
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

type Phase = "loading" | "invalid" | "ready";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authCode = (searchParams ?? new URLSearchParams()).get("code");
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadDetail, setLoadDetail] = useState("링크를 확인하는 중…");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const code = authCode;
      if (code) {
        setLoadDetail("인증 코드로 세션을 연결하는 중…");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          console.error("[reset-password] exchangeCodeForSession:", error);
          setPhase("invalid");
          setLoadDetail("");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setPhase("ready");
        return;
      }

      const tokens = tokensFromUrl();
      if (tokens) {
        setLoadDetail("세션을 적용하는 중…");
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (cancelled) return;
        if (error) {
          console.error("[reset-password] setSession:", error);
          setPhase("invalid");
          setLoadDetail("");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setPhase("ready");
        return;
      }

      setLoadDetail("기존 세션을 확인하는 중…");
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionErr) {
        console.error("[reset-password] getSession:", sessionErr);
        setPhase("invalid");
        setLoadDetail("");
        return;
      }
      if (session?.user) {
        window.history.replaceState(null, "", window.location.pathname);
        setPhase("ready");
        return;
      }

      setPhase("invalid");
      setLoadDetail("");
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authCode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("비밀번호가 변경되었습니다. 다시 로그인해 주세요.");
      router.replace("/login");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.";
      toast.error(authErrorMessageKo(raw));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{loadDetail}</p>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">비밀번호 재설정</h1>
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">유효하지 않거나 만료된 링크입니다.</p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            메일 링크는 한 번만 사용할 수 있거나 시간이 지났을 수 있습니다. 다시 요청해 주세요.
          </p>
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
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">새 비밀번호 설정</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          새 비밀번호를 저장한 뒤 로그인 화면에서 이메일과 새 비밀번호로 로그인하세요.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              새 비밀번호 (6자 이상)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              비밀번호 확인
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "저장 중…" : "비밀번호 변경"}
        </button>

        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            로그인으로 돌아가기
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">링크를 확인하는 중…</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
