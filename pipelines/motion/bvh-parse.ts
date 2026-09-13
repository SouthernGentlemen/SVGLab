const DEGREES = Math.PI / 180;

export interface BvhNode {
  readonly name: string;
  readonly parent: number;
  offset: [number, number, number];
  channels: string[];
  channelStart: number;
}

export interface Bvh {
  readonly nodes: readonly BvhNode[];
  readonly frames: readonly number[][];
  readonly frameTime: number;
  readonly channelCount: number;
}

export interface JointPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Cursor {
  index: number;
}

function expect(tokens: readonly string[], cursor: Cursor, expected: string): void {
  const actual = tokens[cursor.index++];
  if (actual !== expected) throw new Error(`Expected '${expected}', found '${actual ?? "end of file"}'`);
}

function number(tokens: readonly string[], cursor: Cursor, label: string): number {
  const token = tokens[cursor.index++];
  const value = Number(token);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: '${token ?? "end of file"}'`);
  return value;
}

function skipEndSite(tokens: readonly string[], cursor: Cursor): void {
  expect(tokens, cursor, "Site");
  expect(tokens, cursor, "{");
  let depth = 1;
  while (depth > 0) {
    const token = tokens[cursor.index++];
    if (token === undefined) throw new Error("Unterminated End Site");
    if (token === "{") depth += 1;
    if (token === "}") depth -= 1;
  }
}

function parseNode(
  tokens: readonly string[],
  cursor: Cursor,
  nodes: BvhNode[],
  parent: number,
  kind: string | undefined,
): void {
  if (kind !== "ROOT" && kind !== "JOINT") throw new Error(`Unexpected BVH node kind '${kind}'`);
  const name = tokens[cursor.index++];
  if (!name) throw new Error(`Missing name after ${kind}`);
  expect(tokens, cursor, "{");

  const index = nodes.length;
  const node: BvhNode = { name, parent, offset: [0, 0, 0], channels: [], channelStart: 0 };
  nodes.push(node);

  while (true) {
    const token = tokens[cursor.index++];
    if (token === undefined) throw new Error(`Unterminated joint '${name}'`);
    if (token === "}") break;
    if (token === "OFFSET") {
      node.offset = [
        number(tokens, cursor, `${name} X offset`),
        number(tokens, cursor, `${name} Y offset`),
        number(tokens, cursor, `${name} Z offset`),
      ];
      continue;
    }
    if (token === "CHANNELS") {
      const count = number(tokens, cursor, `${name} channel count`);
      node.channels = tokens.slice(cursor.index, cursor.index + count);
      cursor.index += count;
      continue;
    }
    if (token === "JOINT") {
      parseNode(tokens, cursor, nodes, index, token);
      continue;
    }
    if (token === "End") {
      skipEndSite(tokens, cursor);
      continue;
    }
    throw new Error(`Unexpected token '${token}' in joint '${name}'`);
  }
}

export function parseBvh(source: string, sourceName = "BVH source"): Bvh {
  const motionStart = source.search(/(?:^|\n)MOTION\s*(?:\r?\n)/);
  if (motionStart < 0) throw new Error(`${sourceName}: missing MOTION section`);

  const hierarchy = source.slice(0, motionStart).trim();
  const tokens = hierarchy.match(/[{}]|[^\s{}]+/g) ?? [];
  const cursor = { index: 0 };
  expect(tokens, cursor, "HIERARCHY");
  const rootKind = tokens[cursor.index++];
  const nodes: BvhNode[] = [];
  parseNode(tokens, cursor, nodes, -1, rootKind);
  if (cursor.index !== tokens.length) throw new Error(`${sourceName}: trailing hierarchy tokens`);

  let channelCount = 0;
  for (const node of nodes) {
    node.channelStart = channelCount;
    channelCount += node.channels.length;
  }

  const motion = source.slice(motionStart).match(
    /MOTION\s+Frames:\s*(\d+)\s+Frame Time:\s*([+\-\d.eE]+)\s+([\s\S]*)$/,
  );
  if (!motion) throw new Error(`${sourceName}: malformed MOTION header`);
  const frameCount = Number(motion[1]);
  const frameTime = Number(motion[2]);
  const values = motion[3].trim().split(/\s+/).map(Number);
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error(`${sourceName}: invalid frame count`);
  if (!Number.isFinite(frameTime) || frameTime <= 0) throw new Error(`${sourceName}: invalid frame time`);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`${sourceName}: non-numeric motion value`);
  if (values.length !== frameCount * channelCount) {
    throw new Error(`${sourceName}: expected ${frameCount * channelCount} motion values, found ${values.length}`);
  }

  const frames = Array.from({ length: frameCount }, (_, frame) =>
    values.slice(frame * channelCount, (frame + 1) * channelCount));
  return { nodes, frames, frameTime, channelCount };
}

function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[row * 4 + column] += a[row * 4 + inner] * b[inner * 4 + column];
      }
    }
  }
  return result;
}

function translation(axis: string, value: number): number[] {
  const matrix = identity();
  matrix[axis === "X" ? 3 : axis === "Y" ? 7 : 11] = value;
  return matrix;
}

function rotation(axis: string, degrees: number): number[] {
  const radians = degrees * DEGREES;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  if (axis === "X") return [1, 0, 0, 0, 0, cosine, -sine, 0, 0, sine, cosine, 0, 0, 0, 0, 1];
  if (axis === "Y") return [cosine, 0, sine, 0, 0, 1, 0, 0, -sine, 0, cosine, 0, 0, 0, 0, 1];
  return [cosine, -sine, 0, 0, sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Resolve one BVH frame to joint positions using the channel order declared by the file. */
export function jointPositions(bvh: Bvh, frameIndex: number): ReadonlyMap<string, JointPoint> {
  const frame = bvh.frames[frameIndex];
  if (!frame) throw new Error(`BVH frame ${frameIndex} is out of range`);
  const worlds: number[][] = [];
  const positions = new Map<string, JointPoint>();

  for (let index = 0; index < bvh.nodes.length; index += 1) {
    const node = bvh.nodes[index];
    // Blender's importer—the reference viewer published with this dataset—treats a joint's
    // position channels as its animated local position. It subtracts OFFSET when creating
    // the pose delta, because the rest bone already supplies that offset. Bandai's files put
    // position channels on every joint and initialize them near OFFSET, so adding both would
    // double every limb. An absent position channel still falls back to OFFSET on that axis.
    const position = [...node.offset];
    for (let channel = 0; channel < node.channels.length; channel += 1) {
      const name = node.channels[channel];
      const value = frame[node.channelStart + channel];
      const axis = name[0];
      if (name.endsWith("position")) position[axis === "X" ? 0 : axis === "Y" ? 1 : 2] = value;
      else if (!name.endsWith("rotation")) throw new Error(`Unsupported BVH channel '${name}'`);
    }
    let local = translation("X", position[0]);
    local = multiply(local, translation("Y", position[1]));
    local = multiply(local, translation("Z", position[2]));
    for (let channel = 0; channel < node.channels.length; channel += 1) {
      const name = node.channels[channel];
      if (name.endsWith("rotation")) {
        const value = frame[node.channelStart + channel];
        local = multiply(local, rotation(name[0], value));
      }
    }
    const world = node.parent < 0 ? local : multiply(worlds[node.parent], local);
    worlds.push(world);
    positions.set(node.name, { x: world[3], y: world[7], z: world[11] });
  }
  return positions;
}
