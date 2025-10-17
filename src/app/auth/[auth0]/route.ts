import type { NextRequest } from "next/server";

import { auth0 } from "@/lib/auth0";

export function GET(req: NextRequest) {
  return auth0.middleware(req);
}

export function POST(req: NextRequest) {
  return auth0.middleware(req);
}
