import type { Config } from "./config.ts";
import type { TokenStore } from "./token-store.ts";
import type { SmartThingsTokenResponse, TokenPair } from "./types.ts";
import { TokenError } from "./types.ts";

const TOKEN_ENDPOINT = "https://api.smartthings.com/oauth/token";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class Refresher {
  private inflight: Promise<TokenPair> | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly config: Config,
    private readonly store: TokenStore,
    private readonly onFailure: (error: TokenError, count: number) => void,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getFreshAccessToken(): Promise<TokenPair> {
    const current = await this.store.load();
    if (!current) {
      throw new TokenError("No tokens found. Run bootstrap first.", "unknown");
    }

    if (!this.isNearExpiry(current)) {
      return current;
    }

    return this.refreshNow();
  }

  async refreshNow(): Promise<TokenPair> {
    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this.doRefresh().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private isNearExpiry(tokenPair: TokenPair): boolean {
    const thresholdMs = this.config.refreshThresholdMinutes * 60 * 1000;
    return tokenPair.expires_at - Date.now() <= thresholdMs;
  }

  private async doRefresh(): Promise<TokenPair> {
    const current = await this.store.load();
    if (!current) {
      throw new TokenError("No tokens to refresh.", "unknown");
    }

    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
      client_id: this.config.clientId,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
        body,
      });
    } catch (error) {
      const tokenError = new TokenError(
        "Network error during refresh.",
        "network",
        error,
      );
      this.reportFailure(tokenError);
      throw tokenError;
    }

    const text = await response.text();
    if (!response.ok) {
      const kind = text.includes("invalid_grant") ? "invalid_grant" : "http";
      const tokenError = new TokenError(
        `Refresh failed: ${response.status} ${text}`,
        kind,
      );
      this.reportFailure(tokenError);
      throw tokenError;
    }

    let parsed: SmartThingsTokenResponse;
    try {
      parsed = JSON.parse(text) as SmartThingsTokenResponse;
    } catch (error) {
      const tokenError = new TokenError(
        "Unparseable refresh response.",
        "parse",
        error,
      );
      this.reportFailure(tokenError);
      throw tokenError;
    }

    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.expires_in !== "number"
    ) {
      const tokenError = new TokenError(
        "Refresh response missing expected fields.",
        "parse",
        parsed,
      );
      this.reportFailure(tokenError);
      throw tokenError;
    }

    const now = Date.now();
    const next: TokenPair = {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token ?? current.refresh_token,
      expires_at: now + parsed.expires_in * 1000,
      refreshed_at: now,
    };

    await this.store.save(next);
    this.consecutiveFailures = 0;

    console.log(
      `[refresher] refreshed. expires_in=${parsed.expires_in}s rotated=${Boolean(parsed.refresh_token)}`,
    );

    return next;
  }

  private reportFailure(error: TokenError): void {
    this.consecutiveFailures += 1;
    this.onFailure(error, this.consecutiveFailures);
  }
}
