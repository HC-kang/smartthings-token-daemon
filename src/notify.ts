import type { Config } from "./config.ts";
import type { TokenError } from "./types.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function buildNotifier(
  config: Config,
  fetchImpl: FetchLike = fetch,
) {
  return async (error: TokenError, consecutive: number) => {
    console.error(
      `[notify] refresh failed (#${consecutive}): ${error.kind} - ${error.message}`,
    );

    if (!config.discordWebhookUrl) {
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
      await fetchImpl(config.discordWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: [
            `[${severity}] smartthings-token-daemon refresh failure (${consecutive})`,
            `${error.kind}: ${error.message}`,
            hint,
          ].join("\n"),
        }),
      });
    } catch (notifyError) {
      console.error("[notify] discord webhook post failed:", notifyError);
    }
  };
}
