#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { spawn, spawnSync } from "node:child_process";
import { resolve4, resolve6 } from "node:dns/promises";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

const KEEP_TABLES = new Set(["matches", "match_participants"]);
const LOCAL_PG_ROOT = new URL("../.local/pg-client/", import.meta.url);
const LOCAL_PG_BIN = new URL("./usr/lib/postgresql/16/bin/", LOCAL_PG_ROOT);
const LOCAL_PG_LIB = new URL("./usr/lib/x86_64-linux-gnu/", LOCAL_PG_ROOT);

function formatTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function printUsage(exitCode = 0) {
  console.log(`Usage:
  SUPABASE_DB_URL="postgresql://..." node scripts/backup-match-tables.mjs [options]

Options:
  --db-url <url>        Override SUPABASE_DB_URL
  --out <file>          Output file (default: backups/...sql.gz)
  --no-gzip             Write plain .sql (no compression)
  --use-copy            (No-op, kept for compatibility)
  --keep-comments       (No-op, kept for compatibility)
  --dry-run             Print plan and exit
  --schema-file <file>  Override schema source (default: supabase/schema/database_schema.sql)
  -h, --help            Show this help
`);
  process.exit(exitCode);
}

function requireCommand(command, hint) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (!result.error) return;
  if (result.error.code !== "ENOENT") {
    console.error(`Failed to run ${command}:`, result.error);
    process.exit(1);
  }
  console.error(`Missing \`${command}\` in PATH.`);
  if (hint) console.error(hint);
  process.exit(1);
}

function hasCommand(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error;
}

function pathFromUrl(url) {
  return decodeURIComponent(url.pathname);
}

function joinPathEnv(existing, nextValue) {
  if (!nextValue) return existing ?? "";
  if (!existing) return nextValue;
  return `${nextValue}:${existing}`;
}

function buildBackupEnv() {
  const env = { ...process.env };

  const localBinPath = pathFromUrl(LOCAL_PG_BIN).replace(/\/$/, "");
  const localLibPath = pathFromUrl(LOCAL_PG_LIB).replace(/\/$/, "");

  if (spawnSync("test", ["-x", `${localBinPath}/pg_dump`], { stdio: "ignore" }).status === 0) {
    env.PATH = joinPathEnv(env.PATH, localBinPath);
    env.LD_LIBRARY_PATH = joinPathEnv(env.LD_LIBRARY_PATH, localLibPath);
  }

  return env;
}

function runOrThrow(command, args, env, context) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) {
    console.error(`${context} failed:`, result.error);
    process.exit(1);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function hasIpv6DefaultRoute() {
  const result = spawnSync("sh", ["-lc", "ip -6 route show default"], { encoding: "utf8" });
  if (result.error) return false;
  const output = String(result.stdout ?? "").trim();
  return output.length > 0;
}

function redactDbUrl(dbUrl) {
  try {
    const url = new URL(dbUrl);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<redacted>";
  }
}

function normalizePgUrl(dbUrl) {
  try {
    const url = new URL(dbUrl);
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    return url.toString();
  } catch {
    return dbUrl;
  }
}

async function preflightNetwork(dbUrl) {
  let host = "";
  try {
    host = new URL(dbUrl).hostname ?? "";
  } catch {
    return;
  }

  if (!host) return;

  const [v4, v6] = await Promise.all([
    resolve4(host).catch(() => []),
    resolve6(host).catch(() => []),
  ]);

  const hasV4 = Array.isArray(v4) && v4.length > 0;
  const hasV6 = Array.isArray(v6) && v6.length > 0;

  if (hasV4) return;
  if (!hasV6) return;

  if (!hasIpv6DefaultRoute()) {
    console.error(
      [
        "Database host resolves to IPv6-only, but this machine has no IPv6 default route.",
        `Host: ${host}`,
        "",
        "Fix options:",
        "- Enable IPv6 on this machine/network, OR",
        "- Use a Supabase 'Session pooler' connection string (Dashboard → Database → Connect) that resolves to IPv4.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

async function ensurePostgresClientAvailable() {
  if (hasCommand("psql")) return;

  const localBinPath = pathFromUrl(LOCAL_PG_BIN).replace(/\/$/, "");
  const localLibPath = pathFromUrl(LOCAL_PG_LIB).replace(/\/$/, "");
  const localPsqlPath = `${localBinPath}/psql`;

  const alreadyExtracted =
    spawnSync("test", ["-x", localPsqlPath], { stdio: "ignore" }).status === 0;

  if (!alreadyExtracted) {
    console.log("Installing local Postgres client tools (no sudo)...");
    await fs.mkdir(pathFromUrl(LOCAL_PG_ROOT), { recursive: true });
    await fs.mkdir(pathFromUrl(new URL("./debs/", LOCAL_PG_ROOT)), { recursive: true });

    runOrThrow(
      "apt-get",
      ["download", "postgresql-client-16", "libpq5"],
      process.env,
      "apt-get download",
    );

    const debDir = pathFromUrl(new URL("./debs/", LOCAL_PG_ROOT));
    const moved = [];
    for (const file of await fs.readdir(process.cwd())) {
      if (!file.endsWith(".deb")) continue;
      if (!file.startsWith("postgresql-client-16_") && !file.startsWith("libpq5_")) continue;
      const from = new URL(`file://${process.cwd()}/${file}`);
      const to = new URL(`./debs/${file}`, LOCAL_PG_ROOT);
      await fs.rename(pathFromUrl(from), pathFromUrl(to));
      moved.push(pathFromUrl(to));
    }

    if (moved.length === 0) {
      console.error("Expected .deb downloads not found; cannot extract pg_dump.");
      process.exit(1);
    }

    for (const debPath of moved) {
      runOrThrow("dpkg-deb", ["-x", debPath, pathFromUrl(LOCAL_PG_ROOT)], process.env, "dpkg-deb -x");
    }

    // Ensure `libpq.so.5` name exists for the dynamic loader.
    try {
      const entries = await fs.readdir(localLibPath);
      const versioned = entries.find(name => name.startsWith("libpq.so.5.") && !name.endsWith(".a"));
      const linkPath = `${localLibPath}/libpq.so.5`;
      const linkExists = spawnSync("test", ["-e", linkPath], { stdio: "ignore" }).status === 0;
      if (!linkExists && versioned) {
        await fs.symlink(versioned, linkPath);
      }
    } catch (error) {
      console.warn("Warning: failed to create libpq.so.5 symlink:", error);
    }
  }

  const env = buildBackupEnv();
  if (!env.LD_LIBRARY_PATH || !env.PATH) {
    console.error("Failed to set up local pg_dump environment.");
    process.exit(1);
  }

  const check = spawnSync("psql", ["--version"], { stdio: "inherit", env });
  if (check.error || (typeof check.status === "number" && check.status !== 0)) {
    console.error(
      "psql is still not runnable. You can install it system-wide with `sudo apt-get install postgresql-client`.",
    );
    process.exit(1);
  }
}

function extractPublicTables(sql) {
  const tables = new Set();
  const regex = /CREATE TABLE public\.([^\s(]+)/g;
  for (const match of sql.matchAll(regex)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    tables.add(raw.replaceAll('"', ""));
  }
  return Array.from(tables).sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv) {
  const args = {
    dbUrl: process.env.SUPABASE_DB_URL ?? "",
    out: "",
    gzip: true,
    useCopy: false,
    keepComments: false,
    dryRun: false,
    schemaFile: new URL("../supabase/schema/database_schema.sql", import.meta.url),
  };

  const raw = argv.slice(2);
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token === "--help" || token === "-h") {
      printUsage(0);
    }
    if (token === "--db-url") {
      args.dbUrl = raw[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--out") {
      args.out = raw[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--no-gzip") {
      args.gzip = false;
      continue;
    }
    if (token === "--use-copy") {
      args.useCopy = true;
      continue;
    }
    if (token === "--keep-comments") {
      args.keepComments = true;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--schema-file") {
      const next = raw[index + 1];
      if (!next) {
        console.error("Missing value for --schema-file");
        printUsage(1);
      }
      args.schemaFile = new URL(next, `file://${process.cwd()}/`);
      index += 1;
      continue;
    }
    console.error(`Unknown option: ${token}`);
    printUsage(1);
  }

  return args;
}

async function gzipFile(inputPath, outputPath) {
  await pipeline(
    createReadStream(inputPath),
    createGzip({ level: 9 }),
    createWriteStream(outputPath),
  );
  await fs.unlink(inputPath);
}

class RestrictLineCommenter extends Transform {
  constructor() {
    super();
    this._buffer = "";
  }

  _transform(chunk, _encoding, callback) {
    try {
      this._buffer += chunk.toString("utf8");
      let idx;
      while ((idx = this._buffer.indexOf("\n")) !== -1) {
        const line = this._buffer.slice(0, idx + 1);
        this._buffer = this._buffer.slice(idx + 1);
        if (line.startsWith("\\restrict ") || line.startsWith("\\unrestrict ")) {
          this.push(`-- ${line}`);
        } else {
          this.push(line);
        }
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      if (this._buffer.length > 0) {
        const line = this._buffer;
        this._buffer = "";
        if (line.startsWith("\\restrict ") || line.startsWith("\\unrestrict ")) {
          this.push(`-- ${line}`);
        } else {
          this.push(line);
        }
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

class CopyStatusStripper extends Transform {
  constructor() {
    super();
    this._buffer = "";
  }

  _transform(chunk, _encoding, callback) {
    try {
      this._buffer += chunk.toString("utf8");
      let idx;
      while ((idx = this._buffer.indexOf("\n")) !== -1) {
        const line = this._buffer.slice(0, idx + 1);
        this._buffer = this._buffer.slice(idx + 1);
        if (/^COPY \d+\r?\n$/.test(line)) continue;
        this.push(line);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      if (this._buffer.length > 0) {
        const line = this._buffer;
        this._buffer = "";
        if (!/^COPY \d+\r?$/.test(line)) {
          this.push(line);
        }
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

const args = parseArgs(process.argv);

if (!args.dbUrl) {
  console.error(
    "Missing SUPABASE_DB_URL (or pass --db-url). Copy the Postgres connection string from Supabase Dashboard > Database > Connect.",
  );
  process.exit(1);
}

const normalizedDbUrl = normalizePgUrl(args.dbUrl);
await ensurePostgresClientAvailable();
if (!args.dryRun) await preflightNetwork(normalizedDbUrl);
const backupEnv = buildBackupEnv();

const schemaSql = await fs.readFile(args.schemaFile, "utf8");
const publicTables = extractPublicTables(schemaSql);
if (publicTables.length === 0) {
  console.error(
    `Failed to find any public tables in ${args.schemaFile.pathname}; cannot build exclude list.`,
  );
  process.exit(1);
}

const unknownKeep = Array.from(KEEP_TABLES).filter(t => !publicTables.includes(t));
if (unknownKeep.length > 0) {
  console.warn(
    `Warning: expected tables not found in schema (${unknownKeep.join(", ")}). The dump will still run, but may include extra tables.`,
  );
}

const excludeTables = publicTables.filter(table => !KEEP_TABLES.has(table));
const timestamp = formatTimestamp(new Date());

let outPath = args.out;
let gzipOutput = args.gzip;

if (outPath) {
  if (!args.gzip && outPath.endsWith(".gz")) {
    outPath = outPath.slice(0, -3);
  }
  gzipOutput = gzipOutput && outPath.endsWith(".gz");
} else {
  outPath = gzipOutput
    ? `backups/matches_match_participants_${timestamp}.sql.gz`
    : `backups/matches_match_participants_${timestamp}.sql`;
}

const sqlPath = gzipOutput ? outPath.slice(0, -3) : outPath;
await fs.mkdir(dirname(sqlPath), { recursive: true });

if (args.dryRun) {
  console.log("Will connect to:");
  console.log(redactDbUrl(normalizedDbUrl));
  console.log("Will export:");
  console.log("- public.matches");
  console.log("- public.match_participants");
  console.log(`Output: ${outPath}`);
  process.exit(0);
}

const outStream = createWriteStream(sqlPath, { encoding: "utf8" });
outStream.write("BEGIN;\n");
outStream.write("SET session_replication_role = replica;\n\n");

const getColumns = tableName => {
  const safeTableName = tableName.replaceAll("'", "''");
  const sql = [
    "select string_agg(quote_ident(column_name), ', ' order by ordinal_position)",
    "from information_schema.columns",
    `where table_schema = 'public' and table_name = '${safeTableName}';`,
  ].join(" ");

  const result = spawnSync(
    "psql",
    [
      "-X",
      "-q",
      "--no-psqlrc",
      "-v",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      normalizedDbUrl,
      "-c",
      sql,
    ],
    { env: backupEnv, encoding: "utf8" },
  );

  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    throw new Error(
      `Failed to fetch column list for ${tableName}${stderr ? `: ${stderr}` : ""}`,
    );
  }

  return String(result.stdout ?? "").trim();
};

const copyTable = async (tableName, columns) => {
  outStream.write(`COPY public.${tableName} (${columns}) FROM STDIN WITH (FORMAT csv);\n`);

  const sql = `COPY public.${tableName} (${columns}) TO STDOUT WITH (FORMAT csv);`;
  const child = spawn(
    "psql",
    ["-X", "-q", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", normalizedDbUrl, "-c", sql],
    { env: backupEnv },
  );

  child.stderr?.pipe(process.stderr);

  const stripCopyStatus = new CopyStatusStripper();
  await pipeline(child.stdout, stripCopyStatus, outStream, { end: false });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`psql COPY failed for ${tableName} (exit ${exitCode})`);
  }

  outStream.write("\\.\n\n");
};

try {
  const matchesColumns = getColumns("matches");
  const participantsColumns = getColumns("match_participants");

  if (!matchesColumns || !participantsColumns) {
    throw new Error("Failed to resolve table columns (matches or match_participants).");
  }

  await copyTable("matches", matchesColumns);
  await copyTable("match_participants", participantsColumns);

  outStream.write("RESET ALL;\n");
  outStream.write("COMMIT;\n");
  outStream.end();
  await new Promise(resolve => outStream.on("close", resolve));
} catch (error) {
  outStream.end();
  console.error("Backup failed:", error);
  process.exit(1);
}

if (gzipOutput) {
  await gzipFile(sqlPath, outPath);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(`Wrote ${sqlPath}`);
}
