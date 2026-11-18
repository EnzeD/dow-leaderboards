export const PRESENCE_ENDPOINT = "/api/analytics/presence";
export const PRESENCE_WINDOW_MS = 75_000;
export const PRESENCE_PING_MS = 25_000;
export const PRESENCE_POLL_MS = 10_000;

const browserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isPresenceId(value: unknown): value is string {
  return typeof value === "string" && browserIdPattern.test(value);
}
