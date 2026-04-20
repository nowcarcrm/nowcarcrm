"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { supabase } from "../../_lib/supabaseClient";

const ROLES = ["super_admin", "ceo", "director", "team_leader", "manager", "staff"] as const;
const RESOURCES = ["leads", "consultations", "announcements", "attendance"] as const;
const FIELDS = ["can_read", "can_create", "can_update", "can_delete"] as const;

type PermRow = {
  id: string;
  role: string;
  resource: string;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
};

export default function AdminPermissionsPage() {
  const { profile, loading } = useAuth();
  const [rows, setRows] = useState<PermRow[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const canView = useMemo(
    () =>
      profile
        ? isSuperAdmin({ email: profile.email, role: profile.role, rank: profile.rank })
        : false,
    [profile]
  );

  const keyOf = (role: string, resource: string, field: string) => `${role}|${resource}|${field}`;

  const valueOf = useCallback(
    (role: string, resource: string, field: (typeof FIELDS)[number]) => {
      const k = keyOf(role, resource, field);
      if (k in pending) return pending[k];
      const hit = rows.find((r) => r.role === role && r.resource === resource);
      return hit ? !!hit[field] : false;
    },
    [rows, pending]
  );

  const toggle = (role: string, resource: string, field: (typeof FIELDS)[number]) => {
    const cur = valueOf(role, resource, field);
    setPending((p) => ({ ...p, [keyOf(role, resource, field)]: !cur }));
  };

  const load = useCallback(async () => {
    if (!canView) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const res = await fetch("/api/admin/permissions", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      toast.error("권한 테이블을 불러오지 못했습니다.");
      return;
    }
    const j = (await res.json()) as { rows: PermRow[] };
    setRows(j.rows ?? []);
    setPending({});
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!canView) return;
    const updates: { role: string; resource: string; field: (typeof FIELDS)[number]; value: boolean }[] = [];
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const field of FIELDS) {
          const k = keyOf(role, resource, field);
          if (!(k in pending)) continue;
          const prev = rows.find((r) => r.role === role && r.resource === resource)?.[field];
          const next = pending[k];
          if (prev === next) continue;
          updates.push({ role, resource, field, value: next });
        }
      }
    }
    if (updates.length === 0) {
      toast("변경 사항이 없습니다.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("저장되었습니다.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>;
  }
  if (!canView) {
    return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50">권한 관리</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">직급 × 리소스 · R/C/U/D (DB 마스터 반영)</p>
        </div>
        <button type="button" className="crm-btn-primary px-4 py-2 text-sm disabled:opacity-60" disabled={saving} onClick={() => void save()}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-[960px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-zinc-800">
              <th className="sticky left-0 z-10 bg-white px-2 py-2 font-semibold dark:bg-zinc-950">리소스</th>
              {ROLES.map((role) => (
                <th key={role} className="px-1 py-2 text-center font-semibold text-slate-700 dark:text-zinc-300">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((resource) => (
              <tr key={resource} className="border-b border-slate-100 dark:border-zinc-800/80">
                <td className="sticky left-0 z-10 bg-white px-2 py-2 font-medium text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
                  {resource}
                </td>
                {ROLES.map((role) => (
                  <td key={`${resource}-${role}`} className="align-top px-1 py-1">
                    <div className="grid grid-cols-2 gap-0.5">
                      {FIELDS.map((field) => (
                        <label
                          key={field}
                          className="flex cursor-pointer items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <input
                            type="checkbox"
                            checked={valueOf(role, resource, field)}
                            onChange={() => toggle(role, resource, field)}
                          />
                          <span className="text-[10px] text-slate-600 dark:text-zinc-400">{field.replace("can_", "")}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
