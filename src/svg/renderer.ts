import { animationSnapshot } from "../animation/sample";
import { SCALE } from "../combat/constants";
import { debugBoxes } from "../combat/collision/boxes";
import type { Aabb, FighterDefinition, FrameReport, SimulationState } from "../combat/types";
import { applyPose, buildFighterNode } from "./rig";

const SVG_NS = "http://www.w3.org/2000/svg";
const STAGE_CENTER_X = 640;
const FLOOR_Y = 610;
const VIEW_SCALE = 1.7;

export interface DebugToggles {
  pushboxes: boolean;
  hurtboxes: boolean;
  hitboxes: boolean;
  origins: boolean;
  rig: boolean;
}

function screenX(world: number): number {
  return STAGE_CENTER_X + (world / SCALE) * VIEW_SCALE;
}

function screenY(world: number): number {
  return FLOOR_Y - (world / SCALE) * VIEW_SCALE;
}

function rectFor(box: Aabb, className: string): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("class", className);
  rect.setAttribute("x", String(screenX(box.x0)));
  rect.setAttribute("y", String(screenY(box.y1)));
  rect.setAttribute("width", String(((box.x1 - box.x0) / SCALE) * VIEW_SCALE));
  rect.setAttribute("height", String(((box.y1 - box.y0) / SCALE) * VIEW_SCALE));
  return rect;
}

export class ArenaRenderer {
  private readonly fighters;
  private readonly debugLayer: SVGGElement;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly definitions: readonly FighterDefinition[],
  ) {
    const fighterLayer = svg.querySelector<SVGGElement>("#fighter-layer");
    const debugLayer = svg.querySelector<SVGGElement>("#debug-layer");
    if (!fighterLayer || !debugLayer) throw new Error("Arena SVG layers are missing");
    this.debugLayer = debugLayer;
    this.fighters = [buildFighterNode("player"), buildFighterNode("dummy")] as const;
    this.fighters.forEach(({ root }) => fighterLayer.appendChild(root));
  }

  render(state: SimulationState, report: FrameReport | null, toggles: DebugToggles) {
    const animations = state.fighters.map((fighter, index) => {
      const animation = animationSnapshot(fighter);
      const node = this.fighters[index];
      applyPose(node, animation.pose);
      node.root.setAttribute(
        "transform",
        `translate(${screenX(fighter.x)} ${screenY(fighter.y)}) scale(${fighter.facing * VIEW_SCALE} ${VIEW_SCALE})`,
      );
      node.root.classList.toggle("is-invulnerable", fighter.invulnerable);
      return animation;
    });

    this.svg.classList.toggle("show-rig", toggles.rig);
    this.debugLayer.replaceChildren();
    const boxes = debugBoxes(state, this.definitions);

    if (toggles.pushboxes) boxes.pushboxes.forEach((box) => this.debugLayer.appendChild(rectFor(box, "debug-box pushbox")));
    if (toggles.hurtboxes) boxes.hurtboxes.flat().forEach((box) => this.debugLayer.appendChild(rectFor(box, "debug-box hurtbox")));
    if (toggles.hitboxes) boxes.hitboxes.flat().forEach((box) => this.debugLayer.appendChild(rectFor(box, "debug-box hitbox")));
    if (toggles.origins) {
      for (const origin of boxes.origins) {
        const marker = document.createElementNS(SVG_NS, "g");
        marker.setAttribute("class", "origin-marker");
        marker.setAttribute("transform", `translate(${screenX(origin.x)} ${screenY(origin.y)})`);
        marker.innerHTML = '<path d="M-8 0H8M0-8V8"/><circle r="3"/>';
        this.debugLayer.appendChild(marker);
      }
    }
    if (report) {
      for (const contact of report.contacts) this.debugLayer.appendChild(rectFor(contact.overlap, contact.ignored ? "debug-box avoided" : "debug-box contact"));
    }
    return animations;
  }
}
