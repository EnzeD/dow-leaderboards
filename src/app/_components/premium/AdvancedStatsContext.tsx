"use client";

import { createContext, useContext } from "react";
import type { UseAdvancedStatsActivationResult } from "@/hooks/useAdvancedStatsActivation";

export type AdvancedStatsContextValue = UseAdvancedStatsActivationResult & {
  ready: boolean;
};

export const AdvancedStatsContext = createContext<AdvancedStatsContextValue | null>(null);

export const useAdvancedStatsContext = () => {
  const ctx = useContext(AdvancedStatsContext);
  if (!ctx) {
    throw new Error("useAdvancedStatsContext must be used within AdvancedStatsProvider");
  }
  return ctx;
};

