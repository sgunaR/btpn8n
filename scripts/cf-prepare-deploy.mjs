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

function runCf(args) {
  return execFileSync("cf", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function quoteYamlString(value) {
  const text = String(value);
  return JSON.stringify(text);
}

function extractBalancedJsonFrom(text, fromIndex) {
  const start = text.indexOf("{", fromIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

function getBoundServiceCredentials(appName, serviceName) {
  if (!appName) return null;

  let envRaw;
  try {
    envRaw = runCf(["env", appName]);
  } catch {
    return null;
  }

  const marker = envRaw.indexOf("VCAP_SERVICES:");
  if (marker === -1) return null;

  const vcapText = extractBalancedJsonFrom(envRaw, marker);
  if (!vcapText) return null;

  let vcap;
  try {
    vcap = JSON.parse(vcapText);
  } catch {
    return null;
  }

  if (!vcap || typeof vcap !== "object") return null;

  const services = Object.values(vcap).flatMap((arr) => (Array.isArray(arr) ? arr : []));
  const exact = services.find((svc) => svc?.name === serviceName);
  if (exact?.credentials) return exact.credentials;

  const postgres = services.find((svc) => {
    const label = String(svc?.label || "").toLowerCase();
    const name = String(svc?.name || "").toLowerCase();
    return label.includes("postgres") || name.includes("postgres");
  });

  return postgres?.credentials || null;
}

function serviceExists(serviceName) {
  try {
    runCf(["service", serviceName]);
    return true;
  } catch {
    return false;
  }
}

async function waitForServiceReady(serviceName, maxChecks = 30, intervalMs = 10000) {
  for (let i = 0; i < maxChecks; i++) {
    const output = runCf(["service", serviceName]);
    const lc = output.toLowerCase();
    if (lc.includes("create succeeded") || lc.includes("update succeeded")) {
      return;
    }

    if (lc.includes("create failed") || lc.includes("update failed")) {
      throw new Error("Service creation failed. Check 'cf service " + serviceName + "' output.");
    }

    await sleep(intervalMs);
  }

  throw new Error("Timed out waiting for service to be ready: " + serviceName);
}

const serviceName = getArg("--service", process.env.CF_DB_SERVICE_NAME || "n8n-db");
const offering = getArg("--offering", "postgresql-db");
const plan = getArg("--plan", "trial");
const secretsFile = getArg("--secrets-file", "vars.secrets.yml");
const bindApp = getArg("--bind-app", "");
const appName = getArg("--app", process.env.CF_APP_NAME || "");
const waitMinutes = Number(getArg("--wait-minutes", process.env.CF_WAIT_MINUTES || "15"));
const pollSeconds = Number(getArg("--poll-seconds", process.env.CF_POLL_SECONDS || "10"));
const requireSecrets = hasFlag("--require-secrets");
const keepKey = hasFlag("--keep-key");

if (!serviceName) {
  console.error("Missing --service <postgres-service-instance-name>.");
  process.exit(1);
}

try {
  if (!serviceExists(serviceName)) {
    console.log("Creating service instance: " + serviceName);
    runCf(["create-service", offering, plan, serviceName]);
  } else {
    console.log("Service instance already exists: " + serviceName);
  }

  console.log("Waiting for service to be ready...");
  await waitForServiceReady(
    serviceName,
    Math.max(1, Math.ceil((waitMinutes * 60) / pollSeconds)),
    Math.max(1, pollSeconds) * 1000,
  );

  if (bindApp) {
    console.log("Binding service to app: " + bindApp);
    runCf(["bind-service", bindApp, serviceName]);
    console.log("Service bound. Run 'cf restage " + bindApp + "' if app is already running.");
  }

  const keyName = "bootstrap-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  let keyCreated = false;

  try {
    let credentials = getBoundServiceCredentials(appName, serviceName);

    if (credentials) {
      console.log("Using credentials from bound app VCAP_SERVICES: " + appName);
    } else {
      try {
        runCf(["create-service-key", serviceName, keyName]);
        keyCreated = true;

        const raw = runCf(["service-key", serviceName, keyName]);
        const jsonText = extractJsonObject(raw);
        if (!jsonText) {
          throw new Error("Could not parse JSON credentials from service key output.");
        }

        credentials = JSON.parse(jsonText);
        console.log("Using credentials from temporary service key.");
      } catch (error) {
        if (requireSecrets) {
          throw error;
        }
        console.warn("Could not fetch service-key credentials; continuing without vars.secrets.yml generation.");
      }
    }

    if (credentials) {
      const normalized = normalizeCredentials(credentials);
      const host = normalized.host;
      const port = normalized.port;
      const database = normalized.database;
      const user = normalized.user;
      const password = normalized.password;

      if (!host || !port || !database || !user || !password) {
        throw new Error(
          "Service key credentials are incomplete. Available keys: " +
            normalized.sourceKeys.join(", "),
        );
      }

      const yml = [
        "# Auto-generated from Cloud Foundry service key. Do not commit.",
        "db-host: " + quoteYamlString(host),
        "db-port: " + quoteYamlString(port),
        "db-name: " + quoteYamlString(database),
        "db-user: " + quoteYamlString(user),
        "db-password: " + quoteYamlString(password),
        "",
      ].join("\n");

      fs.writeFileSync(secretsFile, yml, "utf8");
      console.log("Wrote deployment secrets file: " + secretsFile);
    }
  } finally {
    if (keyCreated && !keepKey) {
      try {
        runCf(["delete-service-key", "-f", serviceName, keyName]);
      } catch {
        console.warn("Warning: failed to delete temporary service key: " + keyName);
      }
    }

    if (keyCreated && keepKey) {
      console.log("Kept service key for debugging: " + keyName);
    }
  }

  console.log("Ready to deploy.");
  console.log("Run: cf push -f manifest.yml");
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
