"use client";

import { supabase } from "@/app/(admin)/_lib/supabaseClient";

export async function assertLeadExportAllowed(opts: {
  leadIds: string[];
  exportType: string;
  fileName: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  const res = await fetch("/api/leads/export-verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      leadIds: opts.leadIds,
      exportType: opts.exportType,
      fileName: opts.fileName,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: j.error ?? "보내기가 거절되었습니다." };
  }
  return { ok: true };
}
