export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  refreshed_at: number;
}

export interface SmartThingsTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export type TokenErrorKind =
  | "invalid_grant"
  | "network"
  | "http"
  | "parse"
  | "unknown";

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly kind: TokenErrorKind,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "TokenError";
  }
}
