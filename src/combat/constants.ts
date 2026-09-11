export const SCALE = 100;
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const GROUND_Y = 0;
export const STAGE_MIN_X = -280 * SCALE;
export const STAGE_MAX_X = 280 * SCALE;

/** Authored world pixels to integer simulation units. */
export function px(value: number): number {
  return Math.trunc(value * SCALE);
}

export function toPixels(value: number): number {
  return value / SCALE;
}
