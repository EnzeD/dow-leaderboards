import { isIP } from "node:net";
import { open, type CountryResponse } from "maxmind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
let countryDatabase: ReturnType<typeof open<CountryResponse>> | undefined;

export async function GET(request: Request) {
  const databasePath = process.env.ANALYTICS_COUNTRY_DB;
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!databasePath || !forwardedIp || !isIP(forwardedIp)) {
    return new Response(null, { status: 204, headers });
  }

  try {
    countryDatabase ??= open<CountryResponse>(databasePath);
    const database = await countryDatabase;
    const country = database.get(forwardedIp)?.country?.iso_code;
    if (country && /^[A-Z]{2}$/.test(country) && country !== "ZZ") {
      return Response.json({ country }, { headers });
    }
  } catch {
    // Country lookup is optional and must not affect the analytics event.
  }

  return new Response(null, { status: 204, headers });
}
