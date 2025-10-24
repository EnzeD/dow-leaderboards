"use server";

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

// GET: Check badge visibility setting
export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("show_pro_badge")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  if (error) {
    console.error("[account] failed to fetch badge visibility", error);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  return NextResponse.json({
    showBadge: data?.show_pro_badge ?? true
  });
}

// POST: Update badge visibility setting
export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const showBadge = typeof body?.showBadge === "boolean" ? body.showBadge : null;

  if (showBadge === null) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_users")
    .update({ show_pro_badge: showBadge })
    .eq("auth0_sub", session.user.sub);

  if (error) {
    console.error("[account] failed to update badge visibility", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, showBadge });
}
