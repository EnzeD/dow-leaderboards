import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { parseReplay } from '@dowde-replay-parser/core';
import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays';
const BATCH_SIZE = Number.parseInt(process.env.REPLAY_GAME_SETTINGS_BATCH_SIZE ?? '50', 10);
const NO_PARSER_DATA = 'No data available.';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const summary = {
  scanned: 0,
  skipped: 0,
  updated: 0,
  missingFile: 0,
  parseFailed: 0,
  errors: 0
};

const formatOptionValue = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value === null || value === undefined) return null;
  const stringified = String(value).trim();
  return stringified.length > 0 ? stringified : null;
};

const filterOptionRecord = (record) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }
  const filtered = Object.entries(record).reduce((acc, [key, value]) => {
    const normalized = formatOptionValue(value);
    if (normalized && normalized !== NO_PARSER_DATA) {
      acc[key] = normalized;
    }
    return acc;
  }, {});
  return Object.keys(filtered).length > 0 ? filtered : null;
};

const sanitizeGameOptions = (nextValue, fallback) => {
  const candidate = filterOptionRecord(nextValue);
  if (candidate) {
    return candidate;
  }
  if (typeof nextValue === 'string') {
    const normalized = formatOptionValue(nextValue);
    if (normalized && normalized !== NO_PARSER_DATA) {
      return normalized;
    }
  }
  const fallbackRecord = filterOptionRecord(fallback);
  if (fallbackRecord) {
    return fallbackRecord;
  }
  if (typeof fallback === 'string') {
    const normalized = formatOptionValue(fallback);
    return normalized && normalized !== NO_PARSER_DATA ? normalized : null;
  }
  return null;
};

const sanitizeGameRules = (nextValue, fallback) => {
  if (Array.isArray(nextValue)) {
    const cleaned = nextValue
      .map(formatOptionValue)
      .filter((rule) => rule && rule !== NO_PARSER_DATA);
    if (cleaned.length > 0) {
      return cleaned;
    }
  } else if (typeof nextValue === 'string') {
    const normalized = formatOptionValue(nextValue);
    if (normalized && normalized !== NO_PARSER_DATA) {
      return [normalized];
    }
  }

  if (Array.isArray(fallback)) {
    const cleanedFallback = fallback
      .map(formatOptionValue)
      .filter((rule) => rule && rule !== NO_PARSER_DATA);
    return cleanedFallback.length > 0 ? cleanedFallback : null;
  }
  if (typeof fallback === 'string') {
    const normalized = formatOptionValue(fallback);
    return normalized && normalized !== NO_PARSER_DATA ? [normalized] : null;
  }
  return fallback ?? null;
};

const hasGameDetails = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return false;
  }

  const rules = Array.isArray(raw.gamerules)
    ? raw.gamerules.filter((rule) => {
      const normalized = formatOptionValue(rule);
      return normalized && normalized !== NO_PARSER_DATA;
    })
    : [];

  const options = raw.gameoptions && typeof raw.gameoptions === 'object' && !Array.isArray(raw.gameoptions)
    ? Object.values(raw.gameoptions).map(formatOptionValue).filter(Boolean)
    : [];

  const rulesComplete = rules.length > 0;
  const optionsComplete = options.length > 0;

  return rulesComplete && optionsComplete;
};

async function downloadReplayToTemp(pathKey) {
  const { data, error } = await supabase
    .storage
    .from(REPLAYS_BUCKET)
    .download(pathKey);

  if (error || !data) {
    summary.missingFile += 1;
    console.error(`Failed to download replay ${pathKey}`, error ?? 'Unknown error');
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const tmpPath = path.join(tmpdir(), `replay-${Date.now()}-${Math.random().toString(16).slice(2)}.rec`);
  await fs.writeFile(tmpPath, buffer);
  return tmpPath;
}

async function processReplay(row) {
  summary.scanned += 1;

  if (!row?.path) {
    summary.skipped += 1;
    return;
  }

  const existingRaw = row.raw_metadata && typeof row.raw_metadata === 'object' ? row.raw_metadata : {};
  if (hasGameDetails(existingRaw)) {
    summary.skipped += 1;
    return;
  }

  const tempFile = await downloadReplayToTemp(row.path);
  if (!tempFile) {
    return;
  }

  try {
    const parsed = await parseReplay(tempFile);
    const updatedRaw = {
      ...existingRaw,
      gameoptions: sanitizeGameOptions(parsed?.gameoptions, existingRaw.gameoptions),
      gamerules: sanitizeGameRules(parsed?.gamerules, existingRaw.gamerules),
    };

    const { error } = await supabase
      .from('replay_metadata')
      .update({
        raw_metadata: updatedRaw,
        updated_at: new Date().toISOString()
      })
      .eq('path', row.path);

    if (error) {
      summary.errors += 1;
      console.error(`Failed to update metadata for ${row.path}`, error);
      return;
    }

    summary.updated += 1;
    console.log(`Updated game settings for ${row.path}`);
  } catch (error) {
    summary.parseFailed += 1;
    console.error(`Failed to parse replay ${row.path}`, error);
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

async function run() {
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('replay_metadata')
      .select('path, raw_metadata')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      summary.errors += 1;
      console.error('Failed to fetch replay metadata batch', error);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      await processReplay(row);
    }

    if (data.length < BATCH_SIZE) {
      break;
    }
    offset += BATCH_SIZE;
  }

  console.log('Backfill complete:', summary);
}

run().catch((error) => {
  console.error('Unexpected error during backfill', error);
  process.exitCode = 1;
});
