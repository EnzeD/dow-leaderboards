import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { readRelicJson } from "../relic-retry.mjs";

test("429 retries respect Retry-After and pause other workers", async () => {
  const started = Date.now();
  let attempts = 0;
  const throttledRequest = readRelicJson(async () => {
    attempts += 1;
    return attempts === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "2" } })
      : Response.json({ recovered: true });
  }, "personal stats");
  await wait(10);

  const otherWorker = readRelicJson(async () => {
    assert.ok(Date.now() - started >= 2000, "concurrent worker skipped the provider's cooldown");
    return Response.json({ resumed: true });
  }, "match history");

  assert.deepEqual(await throttledRequest, { recovered: true });
  assert.deepEqual(await otherWorker, { resumed: true });
  assert.equal(attempts, 2);
});

test("transient connection errors get another attempt", async () => {
  let attempts = 0;
  const result = await readRelicJson(async () => {
    if (++attempts === 1) throw new DOMException("Timed out", "TimeoutError");
    return Response.json({ recovered: true });
  }, "personal stats");
  assert.deepEqual(result, { recovered: true });
  assert.equal(attempts, 2);
});

test("permanent responses and request limits stop the request", async () => {
  let attempts = 0;
  await assert.rejects(readRelicJson(async () => {
    attempts += 1;
    return new Response("not found", { status: 404 });
  }, "personal stats"), /404/);

  await assert.rejects(readRelicJson(() => {
    attempts += 1;
    throw new Error("Relic request cap reached");
  }, "personal stats"), /request cap/);
  assert.equal(attempts, 2);
});

test("an upstream outage stops after three attempts", async () => {
  let attempts = 0;
  await assert.rejects(readRelicJson(async () => {
    attempts += 1;
    return new Response("unavailable", { status: 502 });
  }, "personal stats"), /502/);
  assert.equal(attempts, 3);
});
