"use client";

import { useEffect, useState } from "react";
import { PRESENCE_ENDPOINT, PRESENCE_POLL_MS, PRESENCE_WINDOW_MS } from "@/lib/analytics/presence";

const numberFormat = new Intl.NumberFormat("en");

export function OnlineNow() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let controller: AbortController | undefined;

    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      const pending = new AbortController();
      controller = pending;
      try {
        const response = await fetch(PRESENCE_ENDPOINT, { cache: "no-store", signal: pending.signal });
        if (!response.ok) throw new Error("Presence unavailable");
        const data = await response.json();
        if (!pending.signal.aborted) setCount(typeof data.count === "number" ? data.count : null);
      } catch {
        if (!pending.signal.aborted) setCount(null);
      }
    };

    void refresh();
    const timer = setInterval(refresh, PRESENCE_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <div
      role="status"
      title={`Estimated visible browsers active in the last ${PRESENCE_WINDOW_MS / 1000} seconds`}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm text-neutral-300"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${count !== null ? "bg-emerald-400" : "bg-neutral-500"}`} />
      Online now
      <strong className="tabular-nums text-white">{count === null ? "—" : numberFormat.format(count)}</strong>
    </div>
  );
}
