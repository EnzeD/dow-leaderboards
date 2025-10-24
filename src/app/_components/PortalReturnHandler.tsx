"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Client component that forces a page refresh when returning from Stripe billing portal.
 * This ensures the server component re-fetches with the latest subscription data.
 */
export function PortalReturnHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRefreshed = useRef(false);

  useEffect(() => {
    const fromPortal = searchParams.get("fromPortal");

    if (fromPortal === "true" && !hasRefreshed.current) {
      hasRefreshed.current = true;
      // Force Next.js to re-fetch server component data
      router.refresh();
    }
  }, [searchParams, router]);

  return null;
}
