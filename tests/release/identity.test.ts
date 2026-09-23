import { describe, expect, it } from "vitest";
import {
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
