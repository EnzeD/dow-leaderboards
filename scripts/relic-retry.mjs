const maxAttempts = 3;
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cooldownUntil = 0;

async function waitUntil(deadline) {
  for (let remaining = deadline - Date.now(); remaining > 0; remaining = deadline - Date.now()) {
    await wait(Math.min(remaining, 60_000));
  }
}

function retryAfterMs(response) {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return 0;
  const delay = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export async function readRelicJson(request, context) {
  for (let attempt = 1; ; attempt++) {
    while (cooldownUntil > Date.now()) {
      await waitUntil(cooldownUntil);
    }

    const backoff = 1000 * 2 ** (attempt - 1);
    let response;
    try {
      response = await request();
      if (response.ok) return await response.json();
    } catch (error) {
      const isTransient = error instanceof TypeError || ["AbortError", "TimeoutError"].includes(error?.name);
      if (!isTransient || attempt === maxAttempts) throw error;
      console.warn("Retrying Relic request after a transient connection error");
      await wait(backoff);
      continue;
    }

    const advisedDelay = retryAfterMs(response);
    const retryAt = Date.now() + Math.max(advisedDelay, backoff);
    const pauseWorkers = response.status === 429 || (response.status === 503 && advisedDelay > 0);
    if (pauseWorkers) {
      cooldownUntil = Math.max(cooldownUntil, retryAt);
    }
    if (attempt === maxAttempts || !retryableStatuses.has(response.status)) {
      const body = await response.text().catch(() => "<response unavailable>");
      throw new Error(`Relic request failed for ${context}: ${response.status} ${response.statusText} -> ${body}`);
    }

    await response.body?.cancel().catch(() => {});
    console.warn(`Retrying Relic request after HTTP ${response.status}`);
    if (!pauseWorkers) await waitUntil(retryAt);
  }
}
