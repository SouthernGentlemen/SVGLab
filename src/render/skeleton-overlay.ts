import type { FigureNode } from "./assemble.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const overlays = new WeakMap<FigureNode, SVGGElement>();

function createSkeleton(node: FigureNode): SVGGElement {
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
  node.root.appendChild(overlay);
  overlays.set(node, overlay);
  return overlay;
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

export function updateSkeletonOverlay(node: FigureNode, visible: boolean): void {
  const overlay = overlays.get(node) ?? createSkeleton(node);
  overlay.classList.toggle("is-visible", visible);
  if (!visible) return;
  const positions = bonePositions(node);
  for (const segment of overlay.querySelectorAll<SVGLineElement>(".skeleton-debug-segment")) {
    const from = positions.get(segment.dataset.skeletonFrom ?? "");
    const to = positions.get(segment.dataset.skeletonTo ?? "");
    if (!from || !to) continue;
    segment.setAttribute("x1", from.x.toFixed(3));
    segment.setAttribute("y1", from.y.toFixed(3));
    segment.setAttribute("x2", to.x.toFixed(3));
    segment.setAttribute("y2", to.y.toFixed(3));
  }
  for (const joint of overlay.querySelectorAll<SVGCircleElement>(".skeleton-debug-joint")) {
    const position = positions.get(joint.dataset.skeletonBone ?? "");
    if (!position) continue;
    joint.setAttribute("cx", position.x.toFixed(3));
    joint.setAttribute("cy", position.y.toFixed(3));
  }
}
