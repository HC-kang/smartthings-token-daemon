import { describe, expect, it, mock } from "bun:test";
import type { Config } from "./config.ts";
import { buildNotifier } from "./notify.ts";
import { TokenError } from "./types.ts";

const baseConfig: Config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  tokenFilePath: "./data/tokens.json",
  backupFilePath: "./data/tokens.backup.json",
  listenHost: "0.0.0.0",
  listenPort: 8787,
  refreshThresholdMinutes: 120,
  refreshIntervalHours: 12,
  localBearerToken: "",
  discordWebhookUrl: "https://discord.example/webhook",
};

describe("buildNotifier", () => {
  it("does not notify early for non-urgent transient failures", async () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }));
    const notify = buildNotifier(baseConfig, fetchMock);

    await notify(new TokenError("network down", "network"), 2);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts Discord webhook content for invalid_grant immediately", async () => {
    const calls: Array<{
      input: string | URL | Request;
      init?: RequestInit;
    }> = [];
    const fetchSpy = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(null, { status: 204 });
    };
    const notify = buildNotifier(baseConfig, fetchSpy);

    await notify(new TokenError("grant invalid", "invalid_grant"), 1);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(baseConfig.discordWebhookUrl);

    const requestInit = calls[0]?.init;
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toEqual({
      "Content-Type": "application/json",
    });

    const payload = JSON.parse(String(requestInit?.body)) as {
      content?: string;
    };
    expect(payload.content).toContain("[URGENT] smartthings-token-daemon refresh failure (1)");
    expect(payload.content).toContain("invalid_grant: grant invalid");
    expect(payload.content).toContain("Re-run bootstrap");
  });
});
