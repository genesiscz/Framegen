// What the Pacer's GPU budget needs from the page side: the Pacer decides from the costs it was given, and two of
// those decisions looked like Framegen doing nothing.

// Presents without the upscaler after which its present cost counts as stale (about a quarter of a second).
const PRESENTS_WITHOUT_UPSCALE = 30;

/** The upscaler is the only stage that reports a present cost, and the Pacer keeps the last one for as long as it
 * lives. `note` returns true once, when a Pacer that was given such a cost has presented without the upscaler for a
 * while: the cost is then stale and the Pacer has to be replaced. */
export class UpscaleWatch {
  constructor() { this.fed = false; this.plain = 0; }
  note(upscaled) {
    if (upscaled) { this.fed = true; this.plain = 0; return false; }
    if (!this.fed || ++this.plain < PRESENTS_WITHOUT_UPSCALE) return false;
    this.fed = false;
    this.plain = 0;
    return true;
  }
}

/** A fixed rate is all or nothing: when one generated frame does not fit the source interval, the Pacer generates
 * none (the engine's `fixed_factor`: pair + mid + two presents within 115 % of the interval). Returns the two
 * numbers for the warning, or null when 2x fits. */
export function fixedRateShortfall(report) {
  const interval = report?.source_interval_ms;
  if (!(interval > 0)) return null;
  const need = (report.pair_cost_ms || 0) + (report.mid_cost_ms || 0) + 2 * (report.present_cost_ms || 0);
  return need > interval * 1.15 ? { need, interval } : null;
}
