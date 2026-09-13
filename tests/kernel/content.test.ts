import { describe, expect, it } from "vitest";
import { BASIC_STRIKE, LAB_FIGHTER, SWORD_SLASH, validateContent } from "../../src/kernel/content.ts";

describe("authored combat content", () => {
  it("keeps total duration and named phases honest", () => {
    for (const move of [BASIC_STRIKE, SWORD_SLASH]) {
      expect(move.duration).toBe(move.startup + move.active + move.recovery);
    }
    expect(() => validateContent(LAB_FIGHTER)).not.toThrow();
    expect(Object.values(LAB_FIGHTER.moves)).toEqual([BASIC_STRIKE, SWORD_SLASH]);
  });

  it("keeps hitboxes inside the authoritative active window", () => {
    for (const move of [BASIC_STRIKE, SWORD_SLASH]) {
      for (const hitbox of move.hitboxes) {
        expect(hitbox.startFrame).toBeGreaterThanOrEqual(move.startup);
        expect(hitbox.endFrame).toBeLessThan(move.startup + move.active);
      }
    }
  });

  it("rejects frame data a move cannot honor", () => {
    const broken = { ...LAB_FIGHTER, moves: { ...LAB_FIGHTER.moves, sword: { ...SWORD_SLASH, recovery: 11 } } };
    expect(() => validateContent(broken)).toThrow(/sword-slash: duration/);
  });

  it("commits the sword to a slower swing with more reach than the fist", () => {
    expect(SWORD_SLASH.startup).toBeGreaterThan(BASIC_STRIKE.startup);
    const fist = BASIC_STRIKE.hitboxes[0];
    const blade = SWORD_SLASH.hitboxes[0];
    expect(blade.box.x + blade.box.w).toBeGreaterThan(fist.box.x + fist.box.w);
    expect(blade.damage).toBeGreaterThan(fist.damage);
  });
});
