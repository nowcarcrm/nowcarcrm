import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email이 필요합니다." }, { status: 400 });
    }

    const pageSize = 200;
    let page = 1;
    let found:
      | {
          id: string;
          email?: string;
          email_confirmed_at?: string | null;
          banned_until?: string | null;
          created_at?: string;
          last_sign_in_at?: string | null;
        }
      | null = null;

    while (!found) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: pageSize,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const users = data.users ?? [];
      found =
        users.find((u) => (u.email ?? "").trim().toLowerCase() === email) ?? null;
      if (users.length < pageSize) break;
      page += 1;
      if (page > 50) break;
    }

    return NextResponse.json({
      ok: true,
      email,
      existsInAuthUsers: !!found,
      user: found
        ? {
            id: found.id,
            email: found.email ?? "",
            emailConfirmed: !!found.email_confirmed_at,
            emailConfirmedAt: found.email_confirmed_at ?? null,
            bannedUntil: found.banned_until ?? null,
            createdAt: found.created_at ?? null,
            lastSignInAt: found.last_sign_in_at ?? null,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

