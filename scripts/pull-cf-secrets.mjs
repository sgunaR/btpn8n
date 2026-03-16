#!/usr/bin/env node
import { execFileSync } from "child_process";
import fs from "fs";

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function quoteEnvValue(value) {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(str)) return str;
  return JSON.stringify(str);
}

function runCf(args) {
  return execFileSync("cf", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function extractJsonObject(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function normalizeCredentials(rawCredentials) {
  const c = rawCredentials && typeof rawCredentials === "object" ? rawCredentials : {};
  const source = c.credentials && typeof c.credentials === "object" ? c.credentials : c;

  let host = source.hostname || source.host;
  let port = source.port;
  let database = source.dbname || source.database || source.name;
  let user = source.username || source.user;
  let password = source.password;

  const uriValue = source.uri || source.url || source.connectionString || source.jdbcUrl;
  if (uriValue && typeof uriValue === "string") {
    try {
      const parsed = new URL(uriValue.replace(/^jdbc:/, ""));
      host = host || parsed.hostname;
      port = port || parsed.port || "5432";
      const pathDb = parsed.pathname ? parsed.pathname.replace(/^\//, "") : "";
      database = database || pathDb || parsed.searchParams.get("database") || undefined;
      user = user || (parsed.username ? decodeURIComponent(parsed.username) : undefined);
      password = password || (parsed.password ? decodeURIComponent(parsed.password) : undefined);
    } catch {
      // Keep direct fields if URI parsing fails.
    }
  }

  return {
    host,
    port,
    database,
    user,
    password,
    sourceKeys: Object.keys(source),
  };
}

const serviceName = getArg("--service", process.env.CF_DB_SERVICE_NAME || "n8n-db");
const outFile = getArg("--out", ".env.cf");
const keepKey = hasFlag("--keep-key");

if (!serviceName) {
  console.error("Missing service name. Use --service <postgres-service-instance-name>.");
  process.exit(1);
}

const keyName = "local-bootstrap-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
let keyCreated = false;

try {
  try {
    runCf(["create-service-key", serviceName, keyName]);
    keyCreated = true;
  } catch (error) {
    console.error("Failed to create Cloud Foundry service key.");
    console.error("Make sure you are logged in and have permission to create service keys.");
    const stderr = error && error.stderr && error.stderr.toString ? error.stderr.toString() : "";
    if (stderr) console.error(stderr.trim());
    process.exit(1);
  }

  let serviceKeyRaw;
  try {
    serviceKeyRaw = runCf(["service-key", serviceName, keyName]);
  } catch (error) {
    console.error("Failed to fetch Cloud Foundry service key details.");
    const stderr = error && error.stderr && error.stderr.toString ? error.stderr.toString() : "";
    if (stderr) console.error(stderr.trim());
    process.exit(1);
  }

  const serviceKeyJsonText = extractJsonObject(serviceKeyRaw);
  if (!serviceKeyJsonText) {
    console.error("Unable to find JSON credentials in cf service-key output.");
    process.exit(1);
  }

  let serviceKey;
  try {
    serviceKey = JSON.parse(serviceKeyJsonText);
  } catch {
    console.error("Unable to parse JSON credentials from cf service-key output.");
    process.exit(1);
  }

  const normalized = normalizeCredentials(serviceKey);
  const host = normalized.host;
  const port = normalized.port;
  const database = normalized.database;
  const user = normalized.user;
  const password = normalized.password;

  if (!host || !port || !database || !user || !password) {
    console.error(
      "PostgreSQL credentials from service key are incomplete. Available keys: " +
        normalized.sourceKeys.join(", "),
    );
    process.exit(1);
  }

  const linesOut = [
    "# Auto-generated from Cloud Foundry service key. Do not commit.",
    "# Source service: " + serviceName,
    "DB_TYPE=postgresdb",
    "DB_POSTGRESDB_HOST=" + quoteEnvValue(host),
    "DB_POSTGRESDB_PORT=" + quoteEnvValue(port),
    "DB_POSTGRESDB_DATABASE=" + quoteEnvValue(database),
    "DB_POSTGRESDB_USER=" + quoteEnvValue(user),
    "DB_POSTGRESDB_PASSWORD=" + quoteEnvValue(password),
    "DB_POSTGRESDB_SSL=true",
    "DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED=false",
    "",
  ];

  fs.writeFileSync(outFile, linesOut.join("\n"), { encoding: "utf8" });

  try {
    fs.chmodSync(outFile, 0o600);
  } catch {
    // Windows may not support POSIX mode bits in the same way.
  }

  console.log("Secrets pulled from CF service " + serviceName + " into " + outFile);
  console.log("Next step: load this file in your local run command or shell.");
} finally {
  if (keyCreated && !keepKey) {
    try {
      runCf(["delete-service-key", "-f", serviceName, keyName]);
    } catch {
      console.warn("Warning: could not delete temporary service key " + keyName + ". Delete it manually if needed.");
    }
  }

  if (keyCreated && keepKey) {
    console.log("Kept service key " + keyName + " because --keep-key was provided.");
  }
}
