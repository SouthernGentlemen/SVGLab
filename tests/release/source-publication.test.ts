import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/source-publication.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

function position(fragment: string): number {
  const index = workflow.indexOf(fragment);
  expect(index, `workflow should contain: ${fragment}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("source publication workflow", () => {
  it("can only be invoked with an explicit stable tag input", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("description: Annotated stable source-release tag (vX.Y.Z)");
    expect(workflow).toContain("required: true");
    expect(workflow).not.toMatch(/\n\s{2}push:/);
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("ref: refs/tags/${{ inputs.tag }}");
    expect(workflow).toContain("persist-credentials: false");
  });

  it("publishes only after exact tag, canonical acceptance and identity verification", () => {
    const syntax = position("Validate requested tag syntax");
    const checkout = position("Checkout exact SVGLab release tag");
    const resolveTag = position("Resolve annotated release revision");
    const install = position("run: npm ci");
    const check = position("run: npm run check");
    const identity = position('run: npm run verify:release-identity -- --tag "$TAG" --commit "$COMMIT"');
    const publish = position('gh release create "$TAG" --repo "$GITHUB_REPOSITORY" --verify-tag --generate-notes');

    expect(syntax).toBeLessThan(checkout);
    expect(checkout).toBeLessThan(resolveTag);
    expect(resolveTag).toBeLessThan(install);
    expect(install).toBeLessThan(check);
    expect(check).toBeLessThan(identity);
    expect(identity).toBeLessThan(publish);

    expect(workflow).toContain('object_type="$(git cat-file -t "$tag_ref")"');
    expect(workflow).toContain('if [[ "$object_type" != "tag" ]]');
    expect(workflow).toContain('commit="$(git rev-parse --verify "$tag_ref^{commit}")"');
    expect(workflow).toContain('if [[ "$(git rev-parse HEAD)" != "$commit" ]]');
  });

  it("is idempotent for published releases and refuses conflicting release state", () => {
    expect(workflow).toContain('gh release view "$TAG"');
    expect(workflow).toContain("isDraft,isPrerelease");
    expect(workflow).toContain("existing release $TAG is draft or prerelease; refusing to mutate it");
    expect(workflow).toContain("GitHub Release $TAG is already published; no-op");
  });

  it("does not add package publication or production deployment", () => {
    expect(workflow).not.toContain("npm publish");
    expect(workflow).not.toMatch(/wrangler\s+(?:deploy|publish)/);
    expect(workflow).not.toContain("account_id");
    expect(workflow).not.toContain("routes:");
  });
});
