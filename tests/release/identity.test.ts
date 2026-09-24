import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  observeReleaseIdentity,
  type ReleaseObservation,
  validateReleaseIdentity,
} from "../../pipelines/release/identity.ts";

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const BLOB = "c".repeat(40);

function observed(overrides: Partial<ReleaseObservation> = {}): ReleaseObservation {
  return {
    tag: "v0.1.0",
    tagObjectType: "tag",
    taggedCommit: COMMIT,
    candidateCommit: COMMIT,
    tree: TREE,
    packageBlob: BLOB,
    packageJson: JSON.stringify({ name: "svg-lab", version: "0.1.0", private: true }),
    ...overrides,
  };
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writePackage(root: string, version: string): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "svg-lab", version, private: true }, null, 2) + "\n",
  );
}

function withRepository(version: string, run: (root: string, head: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "svglab-release-identity-"));
  try {
    git(root, ["init", "-q"]);
    git(root, ["config", "user.name", "SVGLab release identity test"]);
    git(root, ["config", "user.email", "svglab-release-identity@example.invalid"]);
    writePackage(root, version);
    git(root, ["add", "package.json"]);
    git(root, ["commit", "-q", "-m", "initial"]);
    run(root, git(root, ["rev-parse", "HEAD"]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("release identity", () => {
  it("returns one immutable GitHub Release identity", () => {
    expect(validateReleaseIdentity(observed())).toEqual({
      schema: "svglab-release-identity/v1",
      publicationAuthority: "github-release",
      packageName: "svg-lab",
      packagePrivate: true,
      version: "0.1.0",
      tag: "v0.1.0",
      commit: COMMIT,
      tree: TREE,
      packageBlob: BLOB,
    });
  });

  it("rejects malformed or non-annotated release tags", () => {
    expect(() => validateReleaseIdentity(observed({ tag: "release-0.1.0" }))).toThrow(/vX\.Y\.Z/);
    expect(() => validateReleaseIdentity(observed({ tagObjectType: "commit" }))).toThrow(/must be annotated/);
  });

  it("rejects tag and package version drift", () => {
    expect(() => validateReleaseIdentity(observed({
      packageJson: JSON.stringify({ name: "svg-lab", version: "0.1.1", private: true }),
    }))).toThrow(/does not match release tag/);
  });

  it("rejects a candidate that is not the exact tagged commit", () => {
    expect(() => validateReleaseIdentity(observed({ candidateCommit: "d".repeat(40) }))).toThrow(/candidate commit/);
  });

  it("keeps the package private so npm cannot become the publication authority", () => {
    expect(() => validateReleaseIdentity(observed({
      packageJson: JSON.stringify({ name: "svg-lab", version: "0.1.0", private: false }),
    }))).toThrow(/private: true/);
  });
});

describe("release identity Git semantics", () => {
  it("rejects a lightweight release tag", () => {
    withRepository("0.1.0", (root, head) => {
      git(root, ["tag", "v0.1.0", head]);
      expect(() => validateReleaseIdentity(observeReleaseIdentity(root, "v0.1.0", head)))
        .toThrow(/must be annotated/);
    });
  });

  it("rejects a malformed semantic release tag", () => {
    withRepository("0.1.0", (root, head) => {
      git(root, ["tag", "-a", "release-0.1.0", "-m", "release", head]);
      expect(() => observeReleaseIdentity(root, "release-0.1.0", head)).toThrow(/vX\.Y\.Z/);
    });
  });

  it("rejects package and tag version mismatch", () => {
    withRepository("0.1.1", (root, head) => {
      git(root, ["tag", "-a", "v0.1.0", "-m", "release", head]);
      expect(() => validateReleaseIdentity(observeReleaseIdentity(root, "v0.1.0", head)))
        .toThrow(/does not match release tag/);
    });
  });

  it("rejects a tag that does not point at the candidate commit", () => {
    withRepository("0.1.0", (root, taggedCommit) => {
      git(root, ["tag", "-a", "v0.1.0", "-m", "release", taggedCommit]);
      writeFileSync(join(root, "next.txt"), "next\n");
      git(root, ["add", "next.txt"]);
      git(root, ["commit", "-q", "-m", "next"]);
      const candidate = git(root, ["rev-parse", "HEAD"]);
      expect(() => validateReleaseIdentity(observeReleaseIdentity(root, "v0.1.0", candidate)))
        .toThrow(/candidate commit/);
    });
  });

  it("accepts an annotated tag on the exact candidate head", () => {
    withRepository("0.1.0", (root, head) => {
      git(root, ["tag", "-a", "v0.1.0", "-m", "release", head]);
      expect(validateReleaseIdentity(observeReleaseIdentity(root, "v0.1.0", head))).toEqual({
        schema: "svglab-release-identity/v1",
        publicationAuthority: "github-release",
        packageName: "svg-lab",
        packagePrivate: true,
        version: "0.1.0",
        tag: "v0.1.0",
        commit: head,
        tree: git(root, ["rev-parse", `${head}^{tree}`]),
        packageBlob: git(root, ["rev-parse", `${head}:package.json`]),
      });
    });
  });
});
