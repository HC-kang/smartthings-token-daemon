export interface Config {
  clientId: string;
  clientSecret: string;
  tokenFilePath: string;
  backupFilePath: string;
  listenHost: string;
  listenPort: number;
  refreshThresholdMinutes: number;
  refreshIntervalHours: number;
  localBearerToken: string;
  slackWebhookUrl: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${name}: ${value}`);
  }

  return parsed;
}

export function loadConfig(): Config {
  return {
    clientId: required("SMARTTHINGS_CLIENT_ID"),
    clientSecret: required("SMARTTHINGS_CLIENT_SECRET"),
    tokenFilePath: optional("TOKEN_FILE_PATH", "./data/tokens.json"),
    backupFilePath: optional("TOKEN_BACKUP_PATH", "./data/tokens.backup.json"),
    listenHost: optional("LISTEN_HOST", "0.0.0.0"),
    listenPort: numberEnv("LISTEN_PORT", 8787),
    refreshThresholdMinutes: numberEnv("REFRESH_THRESHOLD_MINUTES", 120),
    refreshIntervalHours: numberEnv("REFRESH_INTERVAL_HOURS", 12),
    localBearerToken: optional("LOCAL_BEARER_TOKEN", ""),
    slackWebhookUrl: optional("SLACK_WEBHOOK_URL", ""),
  };
}
