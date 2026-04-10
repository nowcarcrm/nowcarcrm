"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { supabase } from "../_lib/supabaseClient";

type Role = "admin" | "manager" | "staff";

type PendingUserRow = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  approval_status: string;
  created_at: string;
};

export default function EmployeesPage() {
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingUsers, setPendingUsers] = useState<PendingUserRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const isAdmin = profile?.role === "admin";

  const loadPendingUsers = useCallback(async () => {
    if (!isAdmin) return;
    setPendingLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/admin/user-approval", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { users?: PendingUserRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "목록을 불러오지 못했습니다.");
      setPendingUsers(data.users ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "승인 대기 목록 로드 실패");
    } finally {
      setPendingLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPendingUsers();
  }, [loadPendingUsers]);

  async function setApproval(userId: string, action: "approve" | "reject") {
    setApprovalBusyId(userId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("세션이 만료되었습니다. 다시 로그인하세요.");

      const res = await fetch("/api/admin/user-approval", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, action }),
      });
      const data = (await res.json()) as { error?: string; user?: { name?: string } };
      if (!res.ok) throw new Error(data.error ?? "처리에 실패했습니다.");

      toast.success(action === "approve" ? "승인했습니다." : "거절 처리했습니다.");
      await loadPendingUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 중 오류");
    } finally {
      setApprovalBusyId(null);
    }
  }

  const disabled = useMemo(
    () => loading || !email.trim() || !password.trim() || !name.trim(),
    [loading, email, password, name]
  );

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    setMessage(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("관리자 인증 세션이 만료되었습니다. 다시 로그인하세요.");

      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
          name: name.trim(),
          role,
        }),
      });
      const data = (await res.json()) as { error?: string; user?: { name: string; email: string } };
      if (!res.ok) throw new Error(data.error ?? "직원 계정 생성 실패");

      setMessage(`직원 계정 생성 완료: ${data.user?.name} (${data.user?.email})`);
      setEmail("");
      setPassword("");
      setName("");
      setRole("staff");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "직원 계정 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        관리자만 직원 계정을 생성할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="crm-card">
      <div className="space-y-6 p-5 sm:p-7 lg:p-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">직원 관리</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          직원은 회원가입 페이지에서 가입할 수 있으며, 관리자 승인 후 CRM을 사용합니다. 필요 시 아래에서
          관리자가 Auth 계정을 직접 만들 수도 있습니다.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            승인 대기 직원 ({pendingUsers.length})
          </h2>
          <button
            type="button"
            onClick={() => void loadPendingUsers()}
            disabled={pendingLoading}
            className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
          >
            {pendingLoading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
        {pendingUsers.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            승인 대기 중인 직원이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingUsers.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/40"
              >
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">{u.name}</div>
                  <div className="text-xs text-zinc-500">
                    {u.email ?? "—"} · {u.role} · {new Date(u.created_at).toLocaleString("ko-KR")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={approvalBusyId === u.id}
                    onClick={() => void setApproval(u.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    disabled={approvalBusyId === u.id}
                    onClick={() => void setApproval(u.id, "reject")}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  >
                    거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={createEmployee}
        className="max-w-xl space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            이름
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50"
            placeholder="예: 김직원"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            이메일(아이디)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50"
            placeholder="name@company.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            초기 비밀번호
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            역할
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50"
          >
            <option value="staff">staff</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "생성 중..." : "직원 계정 생성"}
        </button>
        {message ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200">
            {message}
          </div>
        ) : null}
      </form>
      </div>
    </div>
  );
}
