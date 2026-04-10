"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";
import {
  getCurrentAuthProfile,
  resolveAuthProfile,
  signOutAuth,
  type AuthProfile,
} from "@/app/(admin)/_lib/authSupabase";

type RefreshProfileResult = { profile: AuthProfile | null; error: string | null };

type AuthContextValue = {
  profile: AuthProfile | null;
  loading: boolean;
  authError: string | null;
  /** 승인된 세션만 profile 반환. 실패 시 error 문자열 포함. silent면 로딩 스피너를 켜지 않음(세션 이벤트용) */
  refreshProfile: (silent?: boolean) => Promise<RefreshProfileResult>;
  /** 로그인 직후 signIn 응답으로 프로필만 반영 (getUser 레이스 방지) */
  applySignedInProfile: (p: AuthProfile) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  async function refreshProfile(silent = false): Promise<RefreshProfileResult> {
    if (!silent) setLoading(true);
    console.log("[auth-provider] refreshProfile start", { silent });
    try {
      const p = await getCurrentAuthProfile();
      // Silent refresh에서 일시적으로 null이 와도 현재 프로필이 있으면 유지
      setProfile((prev) => (silent && p == null && prev ? prev : p));
      setAuthError(null);
      console.log("[auth-provider] refreshProfile result", { hasProfile: !!p, profileUserId: p?.userId });
      return { profile: p, error: null };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "인증 정보를 확인하는 중 오류가 발생했습니다.";
      setProfile(null);
      setAuthError(msg);
      console.error("[auth-provider] refreshProfile error", msg, err);
      return { profile: null, error: msg };
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function logout() {
    try {
      await signOutAuth();
    } finally {
      setProfile(null);
      setAuthError(null);
      router.replace("/login");
    }
  }

  const applySignedInProfile = useCallback((p: AuthProfile) => {
    setProfile(p);
    setAuthError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshProfile();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth-provider] onAuthStateChange", {
        event,
        hasSession: !!session,
        sessionUserId: session?.user?.id,
      });
      if (event === "SIGNED_OUT") {
        setProfile(null);
        return;
      }
      if (session?.user) {
        void (async () => {
          try {
            const p = await resolveAuthProfile(session.user);
            setProfile(p);
            setAuthError(null);
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "인증 정보를 확인하는 중 오류가 발생했습니다.";
            setProfile(null);
            setAuthError(msg);
          }
        })();
        return;
      }
      void refreshProfile(true);
    });
    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      profile,
      loading,
      authError,
      refreshProfile,
      applySignedInProfile,
      logout,
    }),
    [profile, loading, authError, applySignedInProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
