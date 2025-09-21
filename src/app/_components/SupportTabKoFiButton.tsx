"use client";

import { useEffect, useRef } from "react";

const KO_FI_WIDGET_SRC = "https://storage.ko-fi.com/cdn/widget/Widget_2.js";

let koFiScriptPromise: Promise<void> | null = null;

const ensureKoFiWidgetScript = () => {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (koFiScriptPromise) {
    return koFiScriptPromise;
  }

  koFiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${KO_FI_WIDGET_SRC}"]`) as HTMLScriptElement | null;

    const handleResolve = () => {
      resolve();
    };

    if (existing) {
      if (existing.dataset.loaded === "true" || (window as any).kofiwidget2) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => {
        existing.dataset.loaded = "true";
        handleResolve();
      }, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = KO_FI_WIDGET_SRC;
    script.async = true;
    script.dataset.loaded = "false";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      handleResolve();
    }, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.body.appendChild(script);
  });

  return koFiScriptPromise;
};

type SupportTabKoFiButtonProps = {
  className?: string;
};

export default function SupportTabKoFiButton({ className = "" }: SupportTabKoFiButtonProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container.dataset.kofiRendered === "true") {
      return;
    }

    let cancelled = false;

    ensureKoFiWidgetScript()
      .then(() => {
        if (cancelled) return;
        const widget = (window as typeof window & { kofiwidget2?: { init: (...args: any[]) => void; getHTML?: () => string; } }).kofiwidget2;
        if (!containerRef.current || !widget) {
          return;
        }
        containerRef.current.dataset.kofiRendered = "true";
        try {
          widget.init("Support me", "#72a4f2", "X7X41LD12N");
          const markup = typeof widget.getHTML === "function" ? widget.getHTML() : "";
          if (markup) {
            containerRef.current.innerHTML = markup;
          } else {
            containerRef.current.textContent = "Support me";
          }
        } catch (error) {
          console.error("Failed to initialise Ko-fi widget", error);
          containerRef.current.textContent = "Support me";
        }
      })
      .catch(error => {
        console.error("Failed to load Ko-fi widget script", error);
        if (containerRef.current) {
          containerRef.current.textContent = "Support me";
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span
      ref={containerRef}
      className={`inline-flex items-center justify-center ${className}`.trim()}
      data-kofi-rendered="false"
    />
  );
}
