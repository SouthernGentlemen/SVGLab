import "./skeleton-debug.css";

const SVG_NS = "http://www.w3.org/2000/svg";

const toggle = document.querySelector<HTMLInputElement>("#show-skeleton");
if (!toggle) throw new Error("Missing skeleton debug toggle");

function boneName(bone: SVGGElement): string {
  return bone.dataset.bone ?? "";
}

function parentBone(bone: SVGGElement, fighter: SVGGElement): SVGGElement | null {
  let current = bone.parentElement;
  while (current && current !== fighter) {
    if (current instanceof SVGGElement && current.hasAttribute("data-bone")) return current;
    current = current.parentElement;
  }
  return null;
}

function createSkeleton(fighter: SVGGElement): SVGGElement {
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.classList.add("skeleton-debug-overlay");
  overlay.setAttribute("aria-hidden", "true");

  const bones = [...fighter.querySelectorAll<SVGGElement>("[data-bone]")];

  for (const child of bones) {
    const parent = parentBone(child, fighter);
    if (!parent) continue;

    const segment = document.createElementNS(SVG_NS, "line");
    segment.classList.add("skeleton-debug-segment");
    segment.dataset.skeletonFrom = boneName(parent);
    segment.dataset.skeletonTo = boneName(child);
    overlay.appendChild(segment);
  }

  for (const bone of bones) {
    const joint = document.createElementNS(SVG_NS, "circle");
    joint.classList.add("skeleton-debug-joint");
    if (!parentBone(bone, fighter)) joint.classList.add("skeleton-debug-root");
    joint.dataset.skeletonBone = boneName(bone);
    joint.setAttribute("r", "2.6");
    overlay.appendChild(joint);
  }

  // The overlay is deliberately the final child of the fighter root. SVG paints later
  // siblings last, so the skeleton remains visible above every authored body path/detail.
  fighter.appendChild(overlay);
  return overlay;
}

function existingSkeleton(fighter: SVGGElement): SVGGElement | null {
  for (const child of fighter.children) {
    if (child instanceof SVGGElement && child.classList.contains("skeleton-debug-overlay")) return child;
  }
  return null;
}

function bonePositions(fighter: SVGGElement): Map<string, DOMPoint> {
  const positions = new Map<string, DOMPoint>();
  const svg = fighter.ownerSVGElement;
  const fighterMatrix = fighter.getCTM();
  if (!svg || !fighterMatrix) return positions;

  const toFighter = fighterMatrix.inverse();
  const origin = svg.createSVGPoint();
  origin.x = 0;
  origin.y = 0;

  for (const bone of fighter.querySelectorAll<SVGGElement>("[data-bone]")) {
    const matrix = bone.getCTM();
    const name = boneName(bone);
    if (!matrix || !name) continue;
    const world = origin.matrixTransform(matrix);
    positions.set(name, world.matrixTransform(toFighter));
  }
  return positions;
}

function updateSkeleton(fighter: SVGGElement, overlay: SVGGElement): void {
  const positions = bonePositions(fighter);
  if (positions.size === 0) return;

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

function syncVisibility(): void {
  document.body.classList.toggle("show-skeleton-debug", toggle.checked);
}

function animationFrame(): void {
  if (toggle.checked) {
    for (const fighter of document.querySelectorAll<SVGGElement>(".fighter")) {
      const overlay = existingSkeleton(fighter) ?? createSkeleton(fighter);
      updateSkeleton(fighter, overlay);
    }
  }
  requestAnimationFrame(animationFrame);
}

toggle.addEventListener("change", syncVisibility);
window.addEventListener("keydown", (event) => {
  if (event.repeat || event.code !== "KeyK") return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  toggle.checked = !toggle.checked;
  syncVisibility();
  event.preventDefault();
});

syncVisibility();
requestAnimationFrame(animationFrame);
