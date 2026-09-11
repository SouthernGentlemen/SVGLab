import { describe, expect, it } from "vitest";
import { BASIC_STRIKE, LAB_FIGHTER, validateContent } from "../src/combat/content";

describe("authored combat content", () => {
  it("keeps total duration and named phases honest", () => {
    expect(BASIC_STRIKE.duration).toBe(BASIC_STRIKE.startup + BASIC_STRIKE.active + BASIC_STRIKE.recovery);
    expect(() => validateContent(LAB_FIGHTER)).not.toThrow();
  });

  it("keeps hitboxes inside the authoritative active window", () => {
    for (const hitbox of BASIC_STRIKE.hitboxes) {
      expect(hitbox.startFrame).toBeGreaterThanOrEqual(BASIC_STRIKE.startup);
      expect(hitbox.endFrame).toBeLessThan(BASIC_STRIKE.startup + BASIC_STRIKE.active);
    }
  });
});
