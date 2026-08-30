import { NextResponse } from "next/server";
import { getStatsPatchCatalog } from "@/app/api/stats/patch-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getStatsPatchCatalog();
  return NextResponse.json(catalog, {
    headers: { "Cache-Control": catalog.stale ? "no-store" : "public, s-maxage=300" },
  });
}
