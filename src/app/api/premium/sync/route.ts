import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { syncStripeSubscription } from "@/lib/premium/stripe-sync";

export async function POST(request: Request) {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : null;

  if (!sessionId) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  try {
    const result = await syncStripeSubscription({
      auth0Sub: session.user.sub,
      checkoutSessionId: sessionId,
    });

    return NextResponse.json({ success: Boolean(result), result }, { status: 200 });
  } catch (error) {
    console.error("[premium] sync route failed", error);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
