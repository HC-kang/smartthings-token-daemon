import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenStore } from "./token-store.ts";
import type { TokenPair } from "./types.ts";

describe("TokenStore", () => {
  let directory: string;
  let tokenPath: string;
  let backupPath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "st-token-store-"));
    tokenPath = path.join(directory, "tokens.json");
    backupPath = path.join(directory, "tokens.backup.json");
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("saves and loads a token pair", async () => {
    const store = new TokenStore(tokenPath, backupPath);
    const tokenPair: TokenPair = {
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: 111111,
      refreshed_at: 99999,
    };

    await store.save(tokenPair);
    store.invalidateCache();

    const loaded = await store.load();
    expect(loaded).toEqual(tokenPair);
  });

  it("falls back to the backup file when the primary file is unreadable", async () => {
    const store = new TokenStore(tokenPath, backupPath);
    const first: TokenPair = {
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: 111111,
      refreshed_at: 99999,
    };
    const second: TokenPair = {
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_at: 222222,
      refreshed_at: 199999,
    };

    await store.save(first);
    await store.save(second);
    await fs.writeFile(tokenPath, "{broken-json");
    store.invalidateCache();

    const recovered = await store.load();
    expect(recovered).toEqual(first);
  });
});
