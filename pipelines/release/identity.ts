#!/usr/bin/env node
/** Prove that a source-release tag, commit and package content form one immutable identity. */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

export interface ReleaseObservation {
  readonly tag: string;
  readonly tagObjectType: string;
  readonly taggedCommit: string;
  readonly candidateCommit: string;
  readonly tree: string;
  readonly packageBlob: string;
  readonly packageJson: string;
}

export interface ReleaseIdentity {
  readonly schema: "svglab-release-identity/v1";
  readonly publicationAuthority: "github-release";
  readonly packageName: "svg-lab";
  readonly packagePrivate: true;
  readonly version: string;
  readonly tag: string;
  readonly commit: string;
  readonly tree: string;
  readonly packageBlob: string;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function stableVersion(tag: string): string {
  const match = tag.match(STABLE_TAG);
  if (!match) throw new Error(`release tag '${tag}' must match stable semantic form vX.Y.Z`);
  return tag.slice(1);
}

function fullSha(value: string, label: string): string {
  if (!FULL_SHA.test(value)) throw new Error(`${label} must be an exact 40-character lowercase commit/object SHA`);
  return value;
}

export function validateReleaseIdentity(observation: ReleaseObservation): ReleaseIdentity {
  const version = stableVersion(observation.tag);
  if (observation.tagObjectType !== "tag") {
    throw new Error(`release tag ${observation.tag} must be annotated; observed Git object type '${observation.tagObjectType}'`);
  }

  const taggedCommit = fullSha(observation.taggedCommit, "tagged commit");
  const candidateCommit = fullSha(observation.candidateCommit, "candidate commit");
  if (taggedCommit !== candidateCommit) {
    throw new Error(`release tag ${observation.tag} resolves to ${taggedCommit} but candidate commit is ${candidateCommit}`);
  }

  const tree = fullSha(observation.tree, "release tree");
  const packageBlob = fullSha(observation.packageBlob, "package.json blob");

  let parsed: unknown;
  try {
    parsed = JSON.parse(observation.packageJson) as unknown;
  } catch {
    throw new Error(`package.json at ${taggedCommit} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`package.json at ${taggedCommit} must be a JSON object`);
  }
  const pkg = parsed as Record<string, unknown>;
  if (pkg.name !== "svg-lab") throw new Error(`package.json at ${taggedCommit} must name package 'svg-lab'`);
  if (pkg.private !== true) throw new Error(`package.json at ${taggedCommit} must keep private: true; npm publication is not allowed`);
  if (pkg.version !== version) {
    throw new Error(`package version '${String(pkg.version)}' does not match release tag ${observation.tag}`);
  }

  return {
    schema: "svglab-release-identity/v1",
    publicationAuthority: "github-release",
    packageName: "svg-lab",
    packagePrivate: true,
    version,
    tag: observation.tag,
    commit: taggedCommit,
    tree,
    packageBlob,
  };
}

export function observeReleaseIdentity(root: string, tag: string, candidate: string): ReleaseObservation {
  stableVersion(tag);
  fullSha(candidate, "candidate commit");
  const tagRef = `refs/tags/${tag}`;
  let tagObjectType: string;
  try {
    tagObjectType = git(root, ["cat-file", "-t", tagRef]);
  } catch {
    throw new Error(`release tag ${tag} does not exist`);
  }

  let candidateCommit: string;
  try {
    candidateCommit = git(root, ["rev-parse", "--verify", `${candidate}^{commit}`]);
  } catch {
    throw new Error(`candidate commit ${candidate} does not exist`);
  }

  const taggedCommit = git(root, ["rev-parse", "--verify", `${tagRef}^{commit}`]);
  const tree = git(root, ["rev-parse", "--verify", `${taggedCommit}^{tree}`]);
  const packageBlob = git(root, ["rev-parse", "--verify", `${taggedCommit}:package.json`]);
  const packageJson = git(root, ["show", `${taggedCommit}:package.json`]);
  return { tag, tagObjectType, taggedCommit, candidateCommit, tree, packageBlob, packageJson };
}

function option(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index < 0 ? undefined : argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("usage: verify:release-identity --tag vX.Y.Z --commit <40-char-sha>");
  }
  return value;
}

export function main(argv: readonly string[]): number {
  try {
    const tag = option(argv, "--tag");
    const commit = option(argv, "--commit");
    const known = new Set(["--tag", tag, "--commit", commit]);
    const unknown = argv.find((argument) => !known.has(argument));
    if (unknown) throw new Error(`unknown option '${unknown}'`);
    const identity = validateReleaseIdentity(observeReleaseIdentity(ROOT, tag, commit));
    console.log(JSON.stringify(identity));
    return 0;
  } catch (error) {
    console.error(`verify:release-identity: ${(error as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
