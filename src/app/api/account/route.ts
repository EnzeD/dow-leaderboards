import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

export async function DELETE() {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("app_users")
    .delete()
    .eq("auth0_sub", session.user.sub);

  if (deleteError) {
    console.error("[account] delete failed", deleteError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  const { error: subscriptionDeleteError } = await supabase
    .from("premium_subscriptions")
    .delete()
    .eq("auth0_sub", session.user.sub);

  if (subscriptionDeleteError) {
    console.error("[account] subscription cleanup failed", subscriptionDeleteError);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
