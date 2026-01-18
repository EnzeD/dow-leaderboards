#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import duckdb from "duckdb";
import { parseArgs } from "node:util";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

const requiredEnv = [
  "SUPABASE_DB_URL",
  "OVH_S3_ENDPOINT",
  "OVH_S3_REGION",
  "OVH_S3_BUCKET",
  "OVH_S3_ACCESS_KEY_ID",
  "OVH_S3_SECRET_ACCESS_KEY"
];

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return value;
}

function normalizePgUrl(dbUrl) {
  try {
    const url = new URL(dbUrl);
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    const options = url.searchParams.get("options") ?? "";
    if (!options.includes("statement_timeout")) {
      const nextOptions = options ? `${options} -c statement_timeout=0` : "-c statement_timeout=0";
      url.searchParams.set("options", nextOptions);
    }
    return url.toString();
  } catch {
    return dbUrl;
  }
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function parseDateInput(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`${label} must be YYYY-MM-DD (got ${value}).`);
    process.exit(1);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    console.error(`Invalid ${label} value: ${value}`);
    process.exit(1);
  }
  return date;
}

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  let current = new Date(startDate.getTime());
  while (current <= endDate) {
    dates.push(new Date(current.getTime()));
    current = addDays(current, 1);
  }
  return dates;
}

function getDefaultRange(days) {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endDate = addDays(utcToday, -1);
  const startDate = addDays(endDate, -(days - 1));
  return { startDate, endDate };
}

function run(conn, sql) {
  return new Promise((resolve, reject) => {
    conn.run(sql, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      start: { type: "string" },
      end: { type: "string" },
      days: { type: "string" },
      dryRun: { type: "boolean", default: false }
    }
  });

  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const dbUrl = normalizePgUrl(getEnv("SUPABASE_DB_URL"));
  const bucket = getEnv("OVH_S3_BUCKET");
  const region = getEnv("OVH_S3_REGION");
  const endpointInput = getEnv("OVH_S3_ENDPOINT");
  const accessKeyId = getEnv("OVH_S3_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("OVH_S3_SECRET_ACCESS_KEY");

  const parsedStart = parseDateInput(values.start, "--start");
  const parsedEnd = parseDateInput(values.end, "--end") ?? parsedStart;

  const rangeDays = values.days ? Number(values.days) : 7;
  if (values.days && (!Number.isFinite(rangeDays) || rangeDays < 1)) {
    console.error("--days must be a positive integer.");
    process.exit(1);
  }

  const { startDate, endDate } = parsedStart
    ? { startDate: parsedStart, endDate: parsedEnd }
    : getDefaultRange(rangeDays);

  if (endDate < startDate) {
    console.error("End date must be on or after start date.");
    process.exit(1);
  }

  const dates = buildDateRange(startDate, endDate);
  if (!dates.length) {
    console.log("No dates to archive.");
    return;
  }

  let endpointHost = endpointInput;
  try {
    endpointHost = new URL(endpointInput).host || endpointInput;
  } catch {
    endpointHost = endpointInput.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  console.log(`Archiving ${dates.length} day(s) to s3://${bucket} (region ${region}).`);

  if (values.dryRun) {
    console.log(`Range: ${formatDate(startDate)} -> ${formatDate(endDate)}`);
    return;
  }

  const db = new duckdb.Database(":memory:");
  const conn = db.connect();

  await run(conn, "INSTALL httpfs");
  await run(conn, "LOAD httpfs");
  await run(conn, "INSTALL postgres_scanner");
  await run(conn, "LOAD postgres_scanner");

  await run(conn, `SET s3_region='${escapeSqlLiteral(region)}'`);
  await run(conn, `SET s3_endpoint='${escapeSqlLiteral(endpointHost)}'`);
  await run(conn, "SET s3_url_style='path'");
  await run(conn, "SET s3_use_ssl=true");
  await run(conn, `SET s3_access_key_id='${escapeSqlLiteral(accessKeyId)}'`);
  await run(conn, `SET s3_secret_access_key='${escapeSqlLiteral(secretAccessKey)}'`);

  const escapedDbUrl = escapeSqlLiteral(dbUrl);

  await run(conn, `ATTACH '${escapedDbUrl}' AS supabase (TYPE POSTGRES)`);

  for (const date of dates) {
    const dateStr = formatDate(date);
    const nextDate = addDays(date, 1);
    const startTs = `${dateStr}T00:00:00Z`;
    const endTs = `${formatDate(nextDate)}T00:00:00Z`;

    const matchesKey = `matches/date=${dateStr}/data.parquet`;
    const participantsKey = `match_participants/date=${dateStr}/data.parquet`;

    console.log(`Archiving ${dateStr} -> ${matchesKey}, ${participantsKey}`);

    const matchesQuery =
      `WITH _ AS (SELECT set_config('statement_timeout','0', true)) ` +
      `SELECT * FROM public.matches ` +
      `WHERE completed_at >= TIMESTAMPTZ '${startTs}' ` +
      `AND completed_at < TIMESTAMPTZ '${endTs}'`;
    const participantsQuery =
      `WITH _ AS (SELECT set_config('statement_timeout','0', true)) ` +
      `SELECT mp.* FROM public.match_participants mp ` +
      `JOIN public.matches m ON m.match_id = mp.match_id ` +
      `WHERE m.completed_at >= TIMESTAMPTZ '${startTs}' ` +
      `AND m.completed_at < TIMESTAMPTZ '${endTs}'`;

    await run(
      conn,
      `CREATE OR REPLACE TEMP VIEW matches_day AS\n` +
        `SELECT * FROM postgres_query('supabase', '${escapeSqlLiteral(matchesQuery)}');`
    );

    await run(
      conn,
      `CREATE OR REPLACE TEMP VIEW participants_day AS\n` +
        `SELECT * FROM postgres_query('supabase', '${escapeSqlLiteral(participantsQuery)}');`
    );

    await run(
      conn,
      `COPY (SELECT * FROM matches_day) TO 's3://${bucket}/${matchesKey}' (FORMAT PARQUET);`
    );
    await run(
      conn,
      `COPY (SELECT * FROM participants_day) TO 's3://${bucket}/${participantsKey}' (FORMAT PARQUET);`
    );
  }

  conn.close();
  db.close();
}

main().catch(error => {
  console.error("Archive export failed:", error);
  process.exit(1);
});
