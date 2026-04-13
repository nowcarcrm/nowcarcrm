"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { getPostLoginPath } from "@/app/_lib/authPostLogin";
import { getSupabaseAuthTargetInfo, supabase } from "../_lib/supabaseClient";

type Role = "admin" | "staff";
type Approval = "pending" | "approved" | "rejected";

function roleBadgeLabel(role: string | null | undefined): string {
  if (role === "admin") return "관리자";
  if (role === "staff") return "직원";
  if (role === "manager") return "매니저";
  const s = (role ?? "").trim();
  return s || "직원";
}

function roleBadgeClass(role: string | null | undefined): string {
  if (role === "admin") {
    return "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-100";
  }
  if (role === "manager") {
    return "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-100";
  }
  return "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200";
}

function RoleBadge({ role }: { role: string | null | undefined }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${roleBadgeClass(role)}`}
    >
      {roleBadgeLabel(role)}
    </span>
  );
}

/** 권한 변경 UI용: DB의 manager 등은 staff 옵션으로 매핑 */
function roleForSelect(role: string | null | undefined): Role {
  return role === "admin" ? "admin" : "staff";
}

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: Role | string | null;
  approval_status: Approval | string | null;
  created_at: string;
};

export default function EmployeesPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [createApproval, setCreateApproval] = useState<Approval>("approved");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | Approval>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const isAdmin = profile?.role === "admin";
  const authTarget = getSupabaseAuthTargetInfo();

  function effectiveStatus(s: string | null | undefined): Approval {
    if (s === "pending" || s === "approved" || s === "rejected") return s;
    return "pending";
  }

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("세션이 만료되었습니다. 다시 로그인하세요.");
      console.log("[employees] loadUsers start", { authTarget });
      const resPending = await fetch("/api/admin/user-approval?status=pending&role=staff", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pendingData = (await resPending.json()) as { users?: UserRow[]; error?: string };
      if (!resPending.ok) throw new Error(pendingData.error ?? "승인 대기 목록을 불러오지 못했습니다.");
      console.log("[employees] raw pending users response", pendingData.users ?? []);
      setPendingUsers(pendingData.users ?? []);

      const resAll = await fetch("/api/admin/user-approval?status=all&role=all", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allData = (await resAll.json()) as { users?: UserRow[]; error?: string };
      if (!resAll.ok) throw new Error(allData.error ?? "전체 직원 목록을 불러오지 못했습니다.");
      console.log("[employees] raw all users response", allData.users ?? []);
      setUsers(allData.users ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "직원 목록 로드 실패");
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.replace(getPostLoginPath(profile));
    }
  }, [profile, router]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!isAdmin) return;
    console.log("[employees] pendingUsers (server filtered role=staff,status=pending)", pendingUsers);
  }, [pendingUsers, isAdmin]);

  async function updateUserRole(target: UserRow, next: Role) {
    const prev = roleForSelect(target.role);
    if (prev === next) return;

    const name = target.name?.trim() || target.email || "해당 직원";
    const msg =
      next === "admin"
        ? `정말 「${name}」을(를) 관리자로 변경하시겠습니까?`
        : `정말 「${name}」을(를) 일반 직원으로 변경하시겠습니까?`;
    if (!window.confirm(msg)) return;

    setRoleBusyId(target.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("세션이 만료되었습니다. 다시 로그인하세요.");

      const res = await fetch("/api/admin/employees/role", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: target.id, role: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "권한 변경에 실패했습니다.");
      toast.success(next === "admin" ? "관리자로 변경했습니다." : "일반 직원으로 변경했습니다.");
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "권한 변경 중 오류");
      await loadUsers();
    } finally {
      setRoleBusyId(null);
    }
  }

  async function setApproval(userId: string, status: Approval) {
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
        body: JSON.stringify({ userId, status }),
      });
      const data = (await res.json()) as { error?: string; user?: { name?: string } };
      if (!res.ok) throw new Error(data.error ?? "처리에 실패했습니다.");

      if (status === "approved") toast.success("직원 승인이 완료되었습니다.");
      else if (status === "rejected") toast.success("직원 계정이 거절 처리되었습니다.");
      else toast.success("직원 상태를 승인 대기로 변경했습니다.");
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 중 오류");
    } finally {
      setApprovalBusyId(null);
    }
  }

  const disabled = useMemo(
    () => loadingCreate || !email.trim() || !password.trim() || !name.trim(),
    [loadingCreate, email, password, name]
  );

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setLoadingCreate(true);
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
          approval_status: createApproval,
        }),
      });
      const data = (await res.json()) as { error?: string; user?: { name: string; email: string } };
      if (!res.ok) throw new Error(data.error ?? "직원 계정 생성 실패");

      setMessage(`직원 계정 생성 완료: ${data.user?.name} (${data.user?.email})`);
      setEmail("");
      setPassword("");
      setName("");
      setRole("staff");
      setCreateApproval("approved");
      await loadUsers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "직원 계정 생성 중 오류가 발생했습니다.");
    } finally {
      setLoadingCreate(false);
    }
  }

  async function createInviteLink() {
    if (!isAdmin) return;
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) {
      setMessage("초대 링크를 만들 이메일을 입력해 주세요.");
      return;
    }
    setInviteBusy(true);
    setInviteLink(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("관리자 인증 세션이 만료되었습니다. 다시 로그인하세요.");

      const res = await fetch("/api/admin/employees/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = (await res.json()) as { error?: string; actionLink?: string | null };
      if (!res.ok) throw new Error(data.error ?? "초대 링크 생성 실패");
      setInviteLink(data.actionLink ?? null);
      toast.success("비밀번호 설정(초대) 링크를 생성했습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "초대 링크 생성 중 오류가 발생했습니다.";
      setMessage(msg);
      toast.error(msg);
    } finally {
      setInviteBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        권한이 없습니다.
      </div>
    );
  }

  const approvedCount = users.filter((u) => effectiveStatus(u.approval_status) === "approved").length;
  const rejectedCount = users.filter((u) => effectiveStatus(u.approval_status) === "rejected").length;
  const filteredUsers =
    statusFilter === "all"
      ? users
      : users.filter((u) => effectiveStatus(u.approval_status) === statusFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">직원 관리</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          직원은 회원가입 페이지에서 직접 가입합니다. 가입된 계정은 승인 대기 상태로 등록되며,
          관리자가 이 페이지에서 승인한 뒤 CRM을 사용할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="승인 대기" value={pendingUsers.length} tone="amber" />
        <SummaryCard label="승인 완료" value={approvedCount} tone="emerald" />
        <SummaryCard label="거절" value={rejectedCount} tone="rose" />
      </div>

      <section className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            승인 대기 직원 ({pendingUsers.length})
          </h2>
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loadingUsers}
            className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
          >
            {loadingUsers ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
        {pendingUsers.length === 0 ? (
          <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300">
            현재 승인 대기 중인 직원이 없습니다.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">이메일</th>
                  <th className="px-3 py-2">권한</th>
                  <th className="px-3 py-2">가입일</th>
                  <th className="px-3 py-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2">{u.name || "-"}</td>
                    <td className="px-3 py-2">{u.email || "-"}</td>
                    <td className="px-3 py-2">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-3 py-2">{new Date(u.created_at).toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          disabled={approvalBusyId === u.id}
                          onClick={() => void setApproval(u.id, "approved")}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          disabled={approvalBusyId === u.id}
                          onClick={() => void setApproval(u.id, "rejected")}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          거절
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="crm-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">전체 직원 목록</h2>
          <div className="flex gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                  statusFilter === f
                    ? "bg-indigo-600 text-white"
                    : "border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {filteredUsers.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">표시할 직원이 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">이메일</th>
                  <th className="px-3 py-2">권한</th>
                  <th className="px-3 py-2">승인 상태</th>
                  <th className="px-3 py-2">가입일</th>
                  <th className="px-3 py-2 text-right">권한 변경</th>
                  <th className="px-3 py-2 text-right">승인 처리</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const cur = effectiveStatus(u.approval_status);
                  const isSelf = profile?.userId === u.id;
                  const canChangeRole = isAdmin && cur === "approved";
                  const selectDisabled =
                    roleBusyId === u.id ||
                    !canChangeRole ||
                    (isSelf && roleForSelect(u.role) === "admin");
                  return (
                    <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2">{u.name || "-"}</td>
                      <td className="px-3 py-2">{u.email || "-"}</td>
                      <td className="px-3 py-2">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-3 py-2">{cur}</td>
                      <td className="px-3 py-2">{new Date(u.created_at).toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2 text-right">
                        {isAdmin ? (
                          cur === "approved" ? (
                            <select
                              aria-label={`${u.name ?? u.email ?? u.id} 권한`}
                              className="max-w-[8.5rem] rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                              disabled={selectDisabled}
                              value={roleForSelect(u.role)}
                              onChange={(e) => {
                                const v = e.target.value as Role;
                                void updateUserRole(u, v);
                              }}
                            >
                              <option value="staff">직원</option>
                              <option value="admin">관리자</option>
                            </select>
                          ) : (
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              승인 후 변경
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          {cur !== "pending" ? (
                            <button
                              type="button"
                              disabled={approvalBusyId === u.id}
                              onClick={() => void setApproval(u.id, "pending")}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                            >
                              pending
                            </button>
                          ) : null}
                          {cur !== "approved" ? (
                            <button
                              type="button"
                              disabled={approvalBusyId === u.id}
                              onClick={() => void setApproval(u.id, "approved")}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                            >
                              approved
                            </button>
                          ) : null}
                          {cur !== "rejected" ? (
                            <button
                              type="button"
                              disabled={approvalBusyId === u.id}
                              onClick={() => void setApproval(u.id, "rejected")}
                              className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 dark:border-rose-500/40 dark:text-rose-300"
                            >
                              rejected
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            관리자 직접 계정 생성(선택)
          </h2>
          <button
            type="button"
            onClick={() => setCreateOpen((p) => !p)}
            className="rounded border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-600"
          >
            {createOpen ? "접기" : "펼치기"}
          </button>
        </div>
        {createOpen ? (
          <form onSubmit={createEmployee} className="mt-4 max-w-2xl space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50" placeholder="예: 김직원" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">이메일(아이디)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50" placeholder="name@company.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">초기 비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">역할</label>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50">
                  <option value="staff">직원</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">초기 승인 상태</label>
                <select value={createApproval} onChange={(e) => setCreateApproval(e.target.value as Approval)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50">
                  <option value="approved">approved</option>
                  <option value="pending">pending</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={disabled} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {loadingCreate ? "생성 중..." : "직원 계정 생성"}
              </button>
              <button type="button" onClick={() => void createInviteLink()} disabled={inviteBusy || !email.trim()} className="rounded-xl border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50 dark:border-indigo-500/40 dark:text-indigo-300">
                {inviteBusy ? "생성 중..." : "비밀번호 설정 링크 생성"}
              </button>
            </div>
            {inviteLink ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                초대 링크: <span className="break-all">{inviteLink}</span>
              </div>
            ) : null}
            {message ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200">
                {message}
              </div>
            ) : null}
          </form>
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "rose" }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
        : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
