import { NextResponse } from "next/server";
import { getBatchProBadgeStatus } from "@/lib/pro-badge";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { profileIds } = body;

    if (!Array.isArray(profileIds)) {
      return NextResponse.json({ error: "profileIds must be an array" }, { status: 400 });
    }

    const badgeStatuses = await getBatchProBadgeStatus(profileIds);

    // Convert Map to object for JSON serialization
    const statusObject: Record<string, { isProMember: boolean; showBadge: boolean }> = {};
    badgeStatuses.forEach((status, profileId) => {
      statusObject[String(profileId)] = status;
    });

    return NextResponse.json({ statuses: statusObject });
  } catch (error) {
    console.error("[pro/badge-status] Failed to fetch badge statuses", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
