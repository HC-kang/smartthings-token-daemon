import type { Refresher } from "./refresher.ts";

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly refresher: Refresher,
    private readonly intervalHours: number,
  ) {}

  start(): void {
    if (this.intervalHours <= 0) {
      console.log("[scheduler] interval <= 0, lazy refresh only");
      return;
    }

    if (this.timer) {
      return;
    }

    const intervalMs = this.intervalHours * 60 * 60 * 1000;
    console.log(`[scheduler] periodic refresh every ${this.intervalHours}h`);

    this.timer = setInterval(() => {
      this.refresher.refreshNow().catch((error) => {
        console.error("[scheduler] periodic refresh failed:", error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }
}
