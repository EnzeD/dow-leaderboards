import { NextRequest, NextResponse } from "next/server";
import {
  attachCacheHeaders,
  resolveActivationStatus,
} from "@/lib/premium/activation-server";

type ActivationResponse = {
  activated: boolean;
  activatedAt?: string;
  expiresAt?: string | null;
  reason?: string;
  forced?: boolean;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const profileIdRaw = url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const profileId = profileIdRaw?.trim();

  if (!profileId) {
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>({
        activated: false,
        reason: "missing_profile",
      }, { status: 400 })
    );
  }

  const status = await resolveActivationStatus(profileId);

  const httpStatus = status.activated
    ? 200
    : status.reason === "not_found" || status.reason === "expired"
      ? 200
      : status.reason === "supabase_not_configured"
        ? 503
        : 200;

  return attachCacheHeaders(
    NextResponse.json<ActivationResponse>({
      activated: status.activated,
      activatedAt: status.activatedAt,
      expiresAt: status.expiresAt,
      reason: status.reason,
      forced: status.forced,
    }, { status: httpStatus })
  );
}

