import { loadConfig } from "./config.ts";
import { buildNotifier } from "./notify.ts";
import { Refresher } from "./refresher.ts";
import { Scheduler } from "./scheduler.ts";
import { TokenStore } from "./token-store.ts";
import { TokenError } from "./types.ts";

const config = loadConfig();
const store = new TokenStore(config.tokenFilePath, config.backupFilePath);
const refresher = new Refresher(config, store, buildNotifier(config));
const scheduler = new Scheduler(refresher, config.refreshIntervalHours);

let schedulerBootstrapped = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function authorize(request: Request): Response | null {
  if (!config.localBearerToken) {
    return null;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${config.localBearerToken}`) {
    return json({ error: "unauthorized" }, 401);
  }

  return null;
}

function startSchedulerIfNeeded(): void {
  if (schedulerBootstrapped) {
    return;
  }

  scheduler.start();
  schedulerBootstrapped = true;
}

const initial = await store.load();
if (!initial) {
  console.error(
    `[boot] No tokens found at ${config.tokenFilePath}. Run bootstrap first.`,
  );
} else {
  console.log(
    `[boot] Loaded tokens. Expires at ${new Date(initial.expires_at).toISOString()}`,
  );
  startSchedulerIfNeeded();
}

const server = Bun.serve({
  hostname: config.listenHost,
  port: config.listenPort,
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    try {
      if (method === "GET" && pathname === "/healthz") {
        const tokenPair = await store.load();
        if (!tokenPair) {
          return json({ status: "no_tokens" }, 503);
        }

        startSchedulerIfNeeded();

        const msLeft = tokenPair.expires_at - Date.now();
        return json({
          status: "ok",
          expires_at: new Date(tokenPair.expires_at).toISOString(),
          expires_in_seconds: Math.max(0, Math.floor(msLeft / 1000)),
          refreshed_at: new Date(tokenPair.refreshed_at).toISOString(),
        });
      }

      if (method === "GET" && pathname === "/token") {
        const denied = authorize(request);
        if (denied) {
          return denied;
        }

        const tokenPair = await refresher.getFreshAccessToken();
        startSchedulerIfNeeded();

        return json({
          access_token: tokenPair.access_token,
          expires_at: tokenPair.expires_at,
          expires_in_seconds: Math.max(
            0,
            Math.floor((tokenPair.expires_at - Date.now()) / 1000),
          ),
        });
      }

      if (method === "POST" && pathname === "/refresh") {
        const denied = authorize(request);
        if (denied) {
          return denied;
        }

        const tokenPair = await refresher.refreshNow();
        startSchedulerIfNeeded();

        return json({
          ok: true,
          expires_at: tokenPair.expires_at,
        });
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof TokenError) {
        const status = error.kind === "invalid_grant" ? 401 : 502;
        return json({ error: error.kind, message: error.message }, status);
      }

      console.error("[server] unexpected error:", error);
      return json({ error: "internal" }, 500);
    }
  },
});

console.log(
  `[boot] Listening on http://${config.listenHost}:${config.listenPort}`,
);

function shutdown(signal: string): void {
  console.log(`[shutdown] ${signal}`);
  scheduler.stop();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
