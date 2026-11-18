"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isPresenceId, PRESENCE_ENDPOINT, PRESENCE_PING_MS } from "@/lib/analytics/presence";

const trackedPages = new Set(["/", "/account", "/login"]);
const storageKey = "dow_live_browser";
const browserIdleMs = 30 * 60_000;

function getBrowserId(fallback: string) {
  try {
    const now = Date.now();
    const existing = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    const id = isPresenceId(existing?.id) && typeof existing.updatedAt === "number" &&
      existing.updatedAt <= now && now - existing.updatedAt < browserIdleMs
      ? existing.id
      : crypto.randomUUID();
    localStorage.setItem(storageKey, JSON.stringify({ id, updatedAt: now }));
    return id;
  } catch {
    return fallback;
  }
}

export function LivePresence() {
  const pathname = usePathname();
  const browserId = useRef<string>();

  useEffect(() => {
    if (!trackedPages.has(pathname ?? "") || !globalThis.crypto?.randomUUID) return;
    browserId.current ??= crypto.randomUUID();
    const tabId = browserId.current;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void fetch(PRESENCE_ENDPOINT, {
        method: "POST",
        body: getBrowserId(tabId),
        credentials: "omit",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    };

    ping();
    const timer = setInterval(ping, PRESENCE_PING_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [pathname]);

  return null;
}
