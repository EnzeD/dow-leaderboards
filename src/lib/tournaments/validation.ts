import type { TournamentDraft } from "@/lib/tournaments/types";

type ValidationSuccess = {
  ok: true;
  value: TournamentDraft;
};
type ValidationFailure = {
  ok: false;
  error: string;
};

export type TournamentValidationResult = ValidationSuccess | ValidationFailure;

const requiredText = (
  value: unknown,
  label: string,
  maxLength: number,
): string | ValidationFailure => {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${label} is required.` };
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return normalized;
};

const optionalText = (
  value: unknown,
  label: string,
  maxLength: number,
): string | null | ValidationFailure => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be text.` };
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return normalized;
};

const httpsUrl = (
  value: unknown,
  label: string,
): string | ValidationFailure => {
  const normalized = requiredText(value, label, 2048);
  if (typeof normalized !== "string") return normalized;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:") {
      return { ok: false, error: `${label} must use HTTPS.` };
    }
    return url.toString();
  } catch {
    return { ok: false, error: `${label} must be a valid URL.` };
  }
};

const tournamentDate = (value: unknown): string | ValidationFailure => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: "Tournament date is required." };
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "Tournament date must be valid." };
  }
  return value;
};

const failed = (value: unknown): value is ValidationFailure =>
  typeof value === "object" && value !== null && "ok" in value && value.ok === false;

export const parseTournamentDraft = (body: unknown): TournamentValidationResult => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid request payload." };
  }

  const input = body as Record<string, unknown>;
  const name = requiredText(input.name, "Name", 120);
  if (failed(name)) return name;
  const description = optionalText(input.description, "Description", 280);
  if (failed(description)) return description;
  const date = tournamentDate(input.tournamentDate);
  if (failed(date)) return date;
  const startTimeLabel = optionalText(input.startTimeLabel, "Start time", 80);
  if (failed(startTimeLabel)) return startTimeLabel;
  const timezoneLabel = optionalText(input.timezoneLabel, "Timezone", 80);
  if (failed(timezoneLabel)) return timezoneLabel;
  const prizePoolLabel = optionalText(input.prizePoolLabel, "Prize pool", 80);
  if (failed(prizePoolLabel)) return prizePoolLabel;
  const imageUrl = httpsUrl(input.imageUrl, "Image URL");
  if (failed(imageUrl)) return imageUrl;
  const ctaLabel = requiredText(input.ctaLabel, "Button label", 60);
  if (failed(ctaLabel)) return ctaLabel;
  const ctaUrl = httpsUrl(input.ctaUrl, "Button URL");
  if (failed(ctaUrl)) return ctaUrl;

  return {
    ok: true,
    value: {
      name,
      description,
      tournamentDate: date,
      startTimeLabel,
      timezoneLabel,
      prizePoolLabel,
      imageUrl,
      ctaLabel,
      ctaUrl,
    },
  };
};
