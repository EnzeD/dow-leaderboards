import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth0 } from "@/lib/auth0";
import type { PublicTournament, Tournament } from "@/lib/tournaments/types";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const tournamentAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const TOURNAMENT_SELECT =
  "id, name, description, tournament_date, start_time_label, timezone_label, prize_pool_label, image_url, cta_label, cta_url, state, created_at, updated_at" as const;

type TournamentRow = {
  id: string;
  name: string;
  description: string | null;
  tournament_date: string;
  start_time_label: string | null;
  timezone_label: string | null;
  prize_pool_label: string | null;
  image_url: string;
  cta_label: string;
  cta_url: string;
  state: "draft" | "archived";
  created_at: string;
  updated_at: string;
};

export const serializeTournament = (row: TournamentRow): Tournament => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  tournamentDate: row.tournament_date,
  startTimeLabel: row.start_time_label ?? null,
  timezoneLabel: row.timezone_label ?? null,
  prizePoolLabel: row.prize_pool_label ?? null,
  imageUrl: row.image_url,
  ctaLabel: row.cta_label,
  ctaUrl: row.cta_url,
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toPublicTournament = (tournament: Tournament): PublicTournament => {
  const { state: _state, createdAt: _createdAt, updatedAt: _updatedAt, ...publicFields } = tournament;
  return publicFields;
};

export const getTournamentAdmin = (): SupabaseClient | null => tournamentAdmin;

export type TournamentManagerContext =
  | {
      ok: true;
      supabase: SupabaseClient;
      auth0Sub: string;
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error: "not_authenticated" | "not_authorized" | "supabase_unavailable";
    };

export const getTournamentManagerContext = async (): Promise<TournamentManagerContext> => {
  const session = await auth0.getSession();
  if (!session) {
    return { ok: false, status: 401, error: "not_authenticated" };
  }
  if (!tournamentAdmin) {
    return { ok: false, status: 503, error: "supabase_unavailable" };
  }

  const { data, error } = await tournamentAdmin
    .from("app_user_permissions")
    .select("can_manage_tournaments")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  if (error) {
    console.error("[tournaments] failed to resolve manager permission", error);
    return { ok: false, status: 503, error: "supabase_unavailable" };
  }
  if (!data?.can_manage_tournaments) {
    return { ok: false, status: 403, error: "not_authorized" };
  }

  return { ok: true, supabase: tournamentAdmin, auth0Sub: session.user.sub };
};

export const tournamentPayload = (value: {
  name: string;
  description: string | null;
  tournamentDate: string;
  startTimeLabel: string | null;
  timezoneLabel: string | null;
  prizePoolLabel: string | null;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
}) => ({
  name: value.name,
  description: value.description,
  tournament_date: value.tournamentDate,
  start_time_label: value.startTimeLabel,
  timezone_label: value.timezoneLabel,
  prize_pool_label: value.prizePoolLabel,
  image_url: value.imageUrl,
  cta_label: value.ctaLabel,
  cta_url: value.ctaUrl,
});

export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const utcDateToday = (): string => new Date().toISOString().slice(0, 10);

export const privateNoStore = (response: Response): Response => {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export const isTrustedJsonMutation = (request: Request): boolean => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};
