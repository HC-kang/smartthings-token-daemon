import { promises as fs } from "node:fs";
import path from "node:path";
import type { TokenPair } from "./types.ts";

export class TokenStore {
  private cached: TokenPair | null = null;

  constructor(
    private readonly filePath: string,
    private readonly backupPath: string,
  ) {}

  async load(): Promise<TokenPair | null> {
    if (this.cached) {
      return this.cached;
    }

    const primary = await this.tryRead(this.filePath);
    if (primary) {
      this.cached = primary;
      return primary;
    }

    const backup = await this.tryRead(this.backupPath);
    if (backup) {
      console.warn("[token-store] primary read failed, recovered from backup");
      this.cached = backup;
      return backup;
    }

    return null;
  }

  async save(next: TokenPair): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });

    try {
      await fs.copyFile(this.filePath, this.backupPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.warn("[token-store] backup copy failed:", error);
      }
    }

    const temporaryPath = `${this.filePath}.tmp`;
    const body = JSON.stringify(next, null, 2);

    await fs.writeFile(temporaryPath, body, { mode: 0o600 });
    await fs.rename(temporaryPath, this.filePath);

    this.cached = next;
  }

  invalidateCache(): void {
    this.cached = null;
  }

  private async tryRead(targetPath: string): Promise<TokenPair | null> {
    try {
      const raw = await fs.readFile(targetPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<TokenPair>;

      if (
        typeof parsed.access_token !== "string" ||
        typeof parsed.refresh_token !== "string" ||
        typeof parsed.expires_at !== "number" ||
        typeof parsed.refreshed_at !== "number"
      ) {
        console.warn(`[token-store] invalid token shape in ${targetPath}`);
        return null;
      }

      return parsed as TokenPair;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.warn(`[token-store] read failed for ${targetPath}:`, error);
      }
      return null;
    }
  }
}
