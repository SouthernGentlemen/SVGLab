import { sampleClip } from "boneyard";
import { SCALE } from "../kernel/constants.ts";
import { activeMove } from "../kernel/state/machine.ts";
import { debugBoxes } from "../kernel/collision/boxes.ts";
import type { Aabb, FighterDefinition, FighterState, FrameReport, SimulationState } from "../kernel/types.ts";
import type { RuntimeCatalog } from "../clips/runtime.ts";
import { assembleFigure } from "./assemble.ts";
import type { FigureNode } from "./assemble.ts";
import { applyPose, depthProfileFor, placeFigure } from "./place.ts";
import { updateSkeletonOverlay } from "./skeleton-overlay.ts";
import type { PartLabelMode } from "./skeleton-overlay.ts";

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
  skeleton: boolean;
}

export interface AnimationSnapshot {
  readonly clip: string;
  readonly frame: number;
  readonly duration: number;
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

function animationName(fighter: FighterState, definition: FighterDefinition): string {
  if (fighter.mode === "attack") return activeMove(fighter, definition).animation;
  if (fighter.mode === "walk") return "bnrWalkNormal";
  if (fighter.mode === "crouch" || fighter.mode === "hitstun" || fighter.mode === "defeated") return "bnrCrouchNormal";
  if (fighter.mode === "jump") return "bnrDashNormal";
  return "bnrIdleNormal";
}

export class ArenaRenderer {
  private readonly svg: SVGSVGElement;
  private readonly definitions: readonly FighterDefinition[];
  private readonly fighterLayer: SVGGElement;
  private readonly debugLayer: SVGGElement;
  private fighters: FigureNode[];

  private constructor(svg: SVGSVGElement, definitions: readonly FighterDefinition[], fighters: FigureNode[]) {
    this.svg = svg;
    this.definitions = definitions;
    const fighterLayer = svg.querySelector<SVGGElement>("#fighter-layer");
    const debugLayer = svg.querySelector<SVGGElement>("#debug-layer");
    if (!fighterLayer || !debugLayer) throw new Error("arena SVG layers are missing");
    this.fighterLayer = fighterLayer;
    this.debugLayer = debugLayer;
    this.fighters = fighters;
    for (const fighter of fighters) fighterLayer.appendChild(fighter.root);
  }

  static async create(svg: SVGSVGElement, definitions: readonly FighterDefinition[]): Promise<ArenaRenderer> {
    return new ArenaRenderer(svg, definitions, await Promise.all([
      assembleFigure("fighter", "player"),
      assembleFigure("barst", "dummy"),
    ]));
  }

  async setFigures(ids: readonly [string, string]): Promise<void> {
    const next = await Promise.all([assembleFigure(ids[0], "player"), assembleFigure(ids[1], "dummy")]);
    for (const fighter of this.fighters) fighter.root.remove();
    this.fighters = next;
    for (const fighter of next) this.fighterLayer.appendChild(fighter.root);
  }

  render(
    state: SimulationState,
    report: FrameReport | null,
    toggles: DebugToggles,
    catalog: RuntimeCatalog,
    labelMode: PartLabelMode,
  ): AnimationSnapshot[] {
    const animations = state.fighters.map((fighter, index) => {
      const name = animationName(fighter, this.definitions[index]);
      const clip = catalog.clips[name];
      if (!clip) throw new Error(`catalog has no '${name}' clip`);
      const frame = fighter.mode === "attack" ? fighter.moveFrame : fighter.stateFrame;
      applyPose(this.fighters[index], sampleClip(clip, frame));
      const origin = catalog.origins[name] ?? name;
      placeFigure(this.fighters[index], screenX(fighter.x), screenY(fighter.y), VIEW_SCALE, fighter.facing,
        depthProfileFor(this.fighters[index], name, origin));
      this.fighters[index].root.classList.toggle("is-invulnerable", fighter.invulnerable);
      updateSkeletonOverlay(this.fighters[index], toggles.skeleton, labelMode);
      return { clip: name, frame, duration: clip.duration };
    });

    this.svg.classList.toggle("show-rig", toggles.rig);
    this.debugLayer.replaceChildren();
    const boxes = debugBoxes(state, this.definitions);
    if (toggles.pushboxes) for (const box of boxes.pushboxes) this.debugLayer.appendChild(rectFor(box, "debug-box pushbox"));
    if (toggles.hurtboxes) for (const box of boxes.hurtboxes.flat()) this.debugLayer.appendChild(rectFor(box, "debug-box hurtbox"));
    if (toggles.hitboxes) for (const box of boxes.hitboxes.flat()) this.debugLayer.appendChild(rectFor(box, "debug-box hitbox"));
    if (toggles.origins) {
      for (const origin of boxes.origins) {
        const marker = document.createElementNS(SVG_NS, "g");
        marker.setAttribute("class", "origin-marker");
        marker.setAttribute("transform", `translate(${screenX(origin.x)} ${screenY(origin.y)})`);
        marker.innerHTML = '<path d="M-8 0H8M0-8V8"/><circle r="3"/>';
        this.debugLayer.appendChild(marker);
      }
    }
    if (report) for (const contact of report.contacts) {
      this.debugLayer.appendChild(rectFor(contact.overlap, contact.ignored ? "debug-box avoided" : "debug-box contact"));
    }
    return animations;
  }
}
