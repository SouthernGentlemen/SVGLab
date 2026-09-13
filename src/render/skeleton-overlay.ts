import type { FigureNode } from "./assemble.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const overlays = new WeakMap<FigureNode, Overlay>();

export type PartLabelMode = "off" | "bones" | "bones-and-cosmetics";

interface Overlay {
  readonly root: SVGGElement;
  readonly labels: SVGGElement;
  readonly cosmeticSignature: string;
}

export function nextPartLabelMode(mode: PartLabelMode): PartLabelMode {
  if (mode === "off") return "bones";
  if (mode === "bones") return "bones-and-cosmetics";
  return "off";
}

function activeCosmeticSignature(node: FigureNode): string {
  return [...node.cosmetics.values()]
    .filter((cosmetic) => cosmetic.enabled)
    .map((cosmetic) => cosmetic.reference)
    .sort()
    .join("\n");
}

function createSkeleton(node: FigureNode): Overlay {
  overlays.get(node)?.root.remove();
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.classList.add("skeleton-debug-overlay");
  overlay.setAttribute("aria-hidden", "true");
  for (const bone of node.rig.bones) {
    if (bone.parent !== null) {
      const segment = document.createElementNS(SVG_NS, "line");
      segment.classList.add("skeleton-debug-segment");
      segment.dataset.skeletonFrom = bone.parent;
      segment.dataset.skeletonTo = bone.name;
      overlay.appendChild(segment);
    }
  }
  for (const bone of node.rig.bones) {
    const joint = document.createElementNS(SVG_NS, "circle");
    joint.classList.add("skeleton-debug-joint");
    if (bone.parent === null) joint.classList.add("skeleton-debug-root");
    joint.dataset.skeletonBone = bone.name;
    joint.setAttribute("r", "2.6");
    overlay.appendChild(joint);
  }
  const labels = document.createElementNS(SVG_NS, "g");
  labels.classList.add("part-label-layer");
  for (const bone of node.rig.bones) {
    const guide = document.createElementNS(SVG_NS, "line");
    guide.classList.add("part-label-guide", "part-label-guide--bone");
    guide.dataset.labelBone = bone.name;
    const label = document.createElementNS(SVG_NS, "text");
    label.classList.add("part-label", "part-label--bone");
    label.dataset.labelBone = bone.name;
    label.textContent = `${bone.name} · ${bone.slot}`;
    labels.appendChild(guide);
    labels.appendChild(label);
  }
  for (const cosmetic of node.cosmetics.values()) {
    if (!cosmetic.enabled) continue;
    const pieceId = cosmetic.reference.slice(cosmetic.reference.lastIndexOf("/") + 1).replace(/\.svg$/, "");
    for (const placement of cosmetic.placements) {
      const guide = document.createElementNS(SVG_NS, "line");
      guide.classList.add("part-label-guide", "part-label-guide--cosmetic");
      guide.dataset.labelBone = placement.bone;
      guide.dataset.labelX = String(placement.point[0]);
      guide.dataset.labelY = String(placement.point[1]);
      const label = document.createElementNS(SVG_NS, "text");
      label.classList.add("part-label", "part-label--cosmetic");
      label.dataset.labelBone = placement.bone;
      label.dataset.labelX = String(placement.point[0]);
      label.dataset.labelY = String(placement.point[1]);
      label.textContent = `${pieceId} @ ${placement.anchor}`;
      labels.appendChild(guide);
      labels.appendChild(label);
    }
  }
  overlay.appendChild(labels);
  node.root.appendChild(overlay);
  const result = { root: overlay, labels, cosmeticSignature: activeCosmeticSignature(node) };
  overlays.set(node, result);
  return result;
}

function bonePositions(node: FigureNode): Map<string, DOMPoint> {
  const positions = new Map<string, DOMPoint>();
  const svg = node.root.ownerSVGElement;
  const rootMatrix = node.root.getCTM();
  if (!svg || !rootMatrix) return positions;
  const origin = svg.createSVGPoint();
  const toRoot = rootMatrix.inverse();
  for (const [name, bone] of node.bones) {
    const matrix = bone.getCTM();
    if (!matrix) continue;
    positions.set(name, origin.matrixTransform(matrix).matrixTransform(toRoot));
  }
  return positions;
}

function cosmeticPosition(
  node: FigureNode,
  label: SVGTextElement,
  toRoot: DOMMatrix,
  svg: SVGSVGElement,
): DOMPoint | null {
  const matrix = node.bones.get(label.dataset.labelBone ?? "")?.getCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = Number(label.dataset.labelX);
  point.y = Number(label.dataset.labelY);
  return point.matrixTransform(matrix).matrixTransform(toRoot);
}

function positionLabels(
  node: FigureNode,
  overlay: Overlay,
  positions: Map<string, DOMPoint>,
  mode: PartLabelMode,
  highlightedBone: string | null,
): void {
  const rootMatrix = node.root.getCTM();
  const screenMatrix = node.root.getScreenCTM();
  const svg = node.root.ownerSVGElement;
  if (!rootMatrix || !screenMatrix || !svg) return;
  const mirrored = rootMatrix.a < 0;
  const screenScale = Math.hypot(screenMatrix.a, screenMatrix.b) || 1;
  const labelScale = 1 / screenScale;
  const screenSide = mirrored ? "right" : "left";
  const localSide = mirrored ? (screenSide === "left" ? "right" : "left") : screenSide;
  const toRoot = rootMatrix.inverse();
  const labels = [...overlay.labels.querySelectorAll<SVGTextElement>(".part-label")]
    .filter((label) => label.classList.contains("part-label--bone")
      ? mode !== "off" || label.dataset.labelBone === highlightedBone
      : mode === "bones-and-cosmetics");
  const entries = labels.flatMap((label) => {
    const position = label.classList.contains("part-label--cosmetic")
      ? cosmeticPosition(node, label, toRoot, svg)
      : positions.get(label.dataset.labelBone ?? "") ?? null;
    return position ? [{ label, position }] : [];
  }).sort((a, b) => a.position.y - b.position.y);
  if (entries.length === 0) return;
  const columnX = localSide === "left"
    ? Math.min(...entries.map((entry) => entry.position.x)) - (8 / screenScale)
    : Math.max(...entries.map((entry) => entry.position.x)) + (8 / screenScale);
  const gap = 11 / screenScale;
  const layoutY: number[] = [];
  for (const entry of entries) {
    const previous = layoutY.at(-1);
    layoutY.push(previous === undefined ? entry.position.y : Math.max(entry.position.y, previous + gap));
  }
  const rawCentre = entries.reduce((sum, entry) => sum + entry.position.y, 0) / entries.length;
  const layoutCentre = layoutY.reduce((sum, y) => sum + y, 0) / layoutY.length;
  const shift = rawCentre - layoutCentre;
  entries.forEach(({ label, position }, index) => {
    const y = layoutY[index] + shift;
    const labelX = columnX + (localSide === "left" ? -3 / screenScale : 3 / screenScale);
    label.setAttribute("transform", `translate(${labelX.toFixed(3)} ${(y + (3 / screenScale)).toFixed(3)}) `
      + `scale(${(mirrored ? -labelScale : labelScale).toFixed(5)} ${labelScale.toFixed(5)})`);
    label.setAttribute("text-anchor", screenSide === "left" ? "end" : "start");
    const guide = label.previousElementSibling as SVGLineElement;
    guide.setAttribute("x1", position.x.toFixed(3));
    guide.setAttribute("y1", position.y.toFixed(3));
    guide.setAttribute("x2", columnX.toFixed(3));
    guide.setAttribute("y2", y.toFixed(3));
  });
}

export function updateSkeletonOverlay(
  node: FigureNode,
  skeletonVisible: boolean,
  labelMode: PartLabelMode = "off",
  highlightedBone: string | null = null,
): void {
  const existing = overlays.get(node);
  const signature = activeCosmeticSignature(node);
  const overlay = !existing || existing.cosmeticSignature !== signature ? createSkeleton(node) : existing;
  const highlighted = highlightedBone !== null && node.bones.has(highlightedBone);
  overlay.root.classList.toggle("is-visible", skeletonVisible || labelMode !== "off" || highlighted);
  overlay.root.classList.toggle("show-skeleton", skeletonVisible);
  overlay.labels.classList.toggle("show-bones", labelMode !== "off");
  overlay.labels.classList.toggle("show-cosmetics", labelMode === "bones-and-cosmetics");
  overlay.labels.classList.toggle("show-highlight", highlighted);
  for (const label of overlay.labels.querySelectorAll<SVGElement>("[data-label-bone]")) {
    const boneLabel = label.classList.contains("part-label--bone") || label.classList.contains("part-label-guide--bone");
    label.classList.toggle("is-highlighted", highlighted && label.dataset.labelBone === highlightedBone && boneLabel);
  }
  if (!skeletonVisible && labelMode === "off" && !highlighted) return;
  const positions = bonePositions(node);
  for (const segment of overlay.root.querySelectorAll<SVGLineElement>(".skeleton-debug-segment")) {
    const from = positions.get(segment.dataset.skeletonFrom ?? "");
    const to = positions.get(segment.dataset.skeletonTo ?? "");
    if (!from || !to) continue;
    segment.setAttribute("x1", from.x.toFixed(3));
    segment.setAttribute("y1", from.y.toFixed(3));
    segment.setAttribute("x2", to.x.toFixed(3));
    segment.setAttribute("y2", to.y.toFixed(3));
  }
  for (const joint of overlay.root.querySelectorAll<SVGCircleElement>(".skeleton-debug-joint")) {
    const position = positions.get(joint.dataset.skeletonBone ?? "");
    if (!position) continue;
    joint.setAttribute("cx", position.x.toFixed(3));
    joint.setAttribute("cy", position.y.toFixed(3));
  }
  if (labelMode === "off" && !highlighted) return;
  positionLabels(node, overlay, positions, labelMode, highlighted ? highlightedBone : null);
}
