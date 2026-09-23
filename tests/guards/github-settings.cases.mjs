import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareGithubRepositorySettings, configuredMergeMethods, rulesetPayload } from "../../pipelines/guards/github-settings-policy.mjs";

const expected = JSON.parse(readFileSync(new URL("../../config/github-repository-settings.json", import.meta.url), "utf8"));
function actual() {
  return {
    repository: {
      full_name: expected.repository,
      default_branch: expected.defaultBranch,
      allow_merge_commit: expected.mergeMethods.mergeCommit,
      allow_squash_merge: expected.mergeMethods.squash,
      allow_rebase_merge: expected.mergeMethods.rebase,
      delete_branch_on_merge: expected.deleteBranchOnMerge,
    },
    rulesets: Object.values(expected.rulesets).map((policy) => rulesetPayload(expected, policy)),
  };
}
function fails(mutate) {
  const state = actual();
  mutate(state);
  return compareGithubRepositorySettings(expected, state.repository, state.rulesets).join("\n");
}
const main = (state) => state.rulesets.find((entry) => entry.name === expected.rulesets.main.name);
const tags = (state) => state.rulesets.find((entry) => entry.name === expected.rulesets.releaseTags.name);
const rule = (entry, type) => entry.rules.find((value) => value.type === type);

test("committed policy allows only squash and matching state passes", () => {
  assert.deepEqual(configuredMergeMethods(expected), ["squash"]);
  const state = actual();
  assert.deepEqual(compareGithubRepositorySettings(expected, state.repository, state.rulesets), []);
});
test("all repository merge methods and completed-branch deletion are checked", () => {
  assert.match(fails((state) => { state.repository.allow_squash_merge = false; }), /squash merges/);
  assert.match(fails((state) => { state.repository.allow_merge_commit = true; }), /merge commits/);
  assert.match(fails((state) => { state.repository.allow_rebase_merge = true; }), /rebase merges/);
  assert.match(fails((state) => { state.repository.delete_branch_on_merge = false; }), /delete branch on merge/);
});
test("main protection, required check, strictness, and bypass drift fail", () => {
  assert.match(fails((state) => { state.rulesets.shift(); }), /main ruleset/);
  assert.match(fails((state) => { rule(main(state), "pull_request").parameters.allowed_merge_methods = ["merge"]; }), /main merge methods/);
  assert.match(fails((state) => { rule(main(state), "required_status_checks").parameters.required_status_checks = []; }), /main required checks/);
  assert.match(fails((state) => { rule(main(state), "required_status_checks").parameters.strict_required_status_checks_policy = false; }), /main current-with-main/);
  assert.match(fails((state) => { main(state).bypass_actors = [{ actor_id: 1 }]; }), /main bypass actors/);
});
test("immutable release tag ruleset cannot disappear or weaken", () => {
  assert.match(fails((state) => { state.rulesets.pop(); }), /releaseTags ruleset/);
  assert.match(fails((state) => { tags(state).rules = [{ type: "deletion" }]; }), /releaseTags rules/);
  assert.match(fails((state) => { tags(state).bypass_actors = [{ actor_id: 1 }]; }), /releaseTags bypass actors/);
});
