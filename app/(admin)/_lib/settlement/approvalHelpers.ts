import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { RANK } from "./permissions";

export async function findTeamLeaderId(teamName: string | null): Promise<string | null> {
  if (!teamName) return null;
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("team_name", teamName)
    .eq("rank", RANK.LEADER)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function findDirectorId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("rank", RANK.DIRECTOR)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}
