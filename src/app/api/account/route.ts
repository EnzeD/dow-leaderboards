import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";

export async function DELETE() {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 500 });
  }

  const { data: appUser, error: lookupError } = await supabase
    .from("app_users")
    .select("primary_profile_id")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  if (lookupError) {
    console.error("[account] lookup failed", lookupError);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("app_users")
    .delete()
    .eq("auth0_sub", session.user.sub);

  if (deleteError) {
    console.error("[account] delete failed", deleteError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  if (appUser?.primary_profile_id) {
    const { error: premiumDeleteError } = await supabase
      .from("premium_feature_activations")
      .delete()
      .eq("profile_id", appUser.primary_profile_id);

    if (premiumDeleteError) {
      console.error("[account] premium cleanup failed", premiumDeleteError);
    }
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
