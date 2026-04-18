import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "./config.ts";
import { Refresher } from "./refresher.ts";
import { TokenStore } from "./token-store.ts";
import type { TokenPair } from "./types.ts";

describe("Refresher", () => {
  let directory: string;
  let tokenPath: string;
  let backupPath: string;
  let config: Config;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "st-refresher-"));
    tokenPath = path.join(directory, "tokens.json");
    backupPath = path.join(directory, "tokens.backup.json");
    config = {
      clientId: "client-id",
      clientSecret: "client-secret",
      tokenFilePath: tokenPath,
      backupFilePath: backupPath,
      listenHost: "127.0.0.1",
      listenPort: 8787,
      refreshThresholdMinutes: 120,
      refreshIntervalHours: 12,
      localBearerToken: "",
      discordWebhookUrl: "",
    };
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("refreshes near-expiry tokens and keeps the old refresh token if SmartThings omits it", async () => {
    const store = new TokenStore(tokenPath, backupPath);
    const initial: TokenPair = {
      access_token: "access-old",
      refresh_token: "refresh-old",
      expires_at: Date.now() + 10_000,
      refreshed_at: Date.now(),
    };

    await store.save(initial);

    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          access_token: "access-new",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const refresher = new Refresher(config, store, () => {}, fetchMock);
    const refreshed = await refresher.getFreshAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshed.access_token).toBe("access-new");
    expect(refreshed.refresh_token).toBe("refresh-old");

    store.invalidateCache();
    const persisted = await store.load();
    expect(persisted?.access_token).toBe("access-new");
    expect(persisted?.refresh_token).toBe("refresh-old");
  });

  it("deduplicates concurrent refresh calls", async () => {
    const store = new TokenStore(tokenPath, backupPath);
    const initial: TokenPair = {
      access_token: "access-old",
      refresh_token: "refresh-old",
      expires_at: Date.now() + 5_000,
      refreshed_at: Date.now(),
    };

    await store.save(initial);

    const fetchMock = mock(async () => {
      await Bun.sleep(25);
      return new Response(
        JSON.stringify({
          access_token: "access-new",
          refresh_token: "refresh-new",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const refresher = new Refresher(config, store, () => {}, fetchMock);
    const [a, b, c] = await Promise.all([
      refresher.refreshNow(),
      refresher.refreshNow(),
      refresher.refreshNow(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.access_token).toBe("access-new");
    expect(b.access_token).toBe("access-new");
    expect(c.access_token).toBe("access-new");
  });
});
