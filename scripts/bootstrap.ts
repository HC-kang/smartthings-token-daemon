#!/usr/bin/env bun

import { loadConfig } from "../src/config.ts";
import { TokenStore } from "../src/token-store.ts";
import type { SmartThingsTokenResponse, TokenPair } from "../src/types.ts";

const config = loadConfig();
const code = process.env.CODE;
const redirectUri = process.env.REDIRECT_URI ?? "https://httpbin.org/get";

if (!code) {
  console.error(
    "Usage:\n  CODE=<authorization_code> REDIRECT_URI=<registered_uri> bun run bootstrap",
  );
  process.exit(1);
}

const basicAuth = Buffer.from(
  `${config.clientId}:${config.clientSecret}`,
).toString("base64");

const body = new URLSearchParams({
  grant_type: "authorization_code",
  code,
  client_id: config.clientId,
  redirect_uri: redirectUri,
});

const response = await fetch("https://api.smartthings.com/oauth/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Basic ${basicAuth}`,
    Accept: "application/json",
  },
  body,
});

const text = await response.text();
if (!response.ok) {
  console.error(`Exchange failed: ${response.status}\n${text}`);
  process.exit(1);
}

let parsed: SmartThingsTokenResponse;
try {
  parsed = JSON.parse(text) as SmartThingsTokenResponse;
} catch (error) {
  console.error("Failed to parse token response:", error);
  process.exit(1);
}

if (
  typeof parsed.access_token !== "string" ||
  typeof parsed.refresh_token !== "string" ||
  typeof parsed.expires_in !== "number"
) {
  console.error("Token response missing expected fields:", text);
  process.exit(1);
}

const now = Date.now();
const tokens: TokenPair = {
  access_token: parsed.access_token,
  refresh_token: parsed.refresh_token,
  expires_at: now + parsed.expires_in * 1000,
  refreshed_at: now,
};

const store = new TokenStore(config.tokenFilePath, config.backupFilePath);
await store.save(tokens);

console.log(`Saved tokens to ${config.tokenFilePath}`);
console.log(`Expires at ${new Date(tokens.expires_at).toISOString()}`);
