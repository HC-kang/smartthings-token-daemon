import type { Config } from "./config.ts";
import type { TokenError } from "./types.ts";

export function buildNotifier(config: Config) {
  return async (error: TokenError, consecutive: number) => {
    console.error(
      `[notify] refresh failed (#${consecutive}): ${error.kind} - ${error.message}`,
    );

    if (!config.slackWebhookUrl) {
      return;
    }

    if (consecutive < 3 && error.kind !== "invalid_grant") {
      return;
    }

    const severity = error.kind === "invalid_grant" ? "URGENT" : "WARN";
    const hint =
      error.kind === "invalid_grant"
        ? "Refresh token invalidated. Re-run bootstrap to re-authorize."
        : "Check container logs and network reachability.";

    try {
      await fetch(config.slackWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: `[${severity}] smartthings-token-daemon refresh failure (${consecutive})\n${error.kind}: ${error.message}\n${hint}`,
        }),
      });
    } catch (notifyError) {
      console.error("[notify] slack post failed:", notifyError);
    }
  };
}
