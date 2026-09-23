function values(value) {
  return Array.isArray(value) ? value : [];
}

function sameValues(actual, wanted) {
  const a = values(actual);
  const b = values(wanted);
  return a.length === b.length && b.every((item) => a.includes(item));
}

function requireEqual(actual, wanted, label, failures) {
  if (actual !== wanted) {
    failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
  }
}

export function configuredMergeMethods(expected) {
  const methods = [];
  if (expected.mergeMethods.mergeCommit) methods.push("merge");
  if (expected.mergeMethods.squash) methods.push("squash");
  if (expected.mergeMethods.rebase) methods.push("rebase");
  return methods;
}

export function rulesetPayload(expected, policy) {
  return {
    name: policy.name,
    target: policy.target,
    enforcement: policy.enforcement,
    bypass_actors: policy.bypassActors,
    conditions: { ref_name: { include: policy.include, exclude: policy.exclude } },
    rules: policy.requiredRules.map((type) => {
      if (type === "pull_request") {
        return {
          type,
          parameters: {
            allowed_merge_methods: configuredMergeMethods(expected),
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_extra_approval_for_unattributed_changes:
              policy.requireExtraApprovalForUnattributedChanges === true,
            require_last_push_approval: false,
            required_approving_review_count: 0,
            required_review_thread_resolution: policy.requiredReviewThreadResolution === true,
          },
        };
      }
      if (type === "required_status_checks") {
        return {
          type,
          parameters: {
            do_not_enforce_on_create: policy.doNotEnforceOnCreate === true,
            required_status_checks: policy.requiredStatusChecks.map((context) => ({ context })),
            strict_required_status_checks_policy: policy.requireBranchUpToDate === true,
          },
        };
      }
      return { type };
    }),
  };
}

export function compareGithubRepositorySettings(expected, repository, rulesets) {
  const failures = [];
  if (!repository || !Array.isArray(rulesets)) return ["repository settings or rulesets could not be read"];
  if (repository.full_name && repository.full_name !== expected.repository) {
    failures.push(`repository identity: expected ${expected.repository}, got ${repository.full_name}`);
  }
  requireEqual(repository.default_branch, expected.defaultBranch, "default branch", failures);
  requireEqual(repository.allow_merge_commit, expected.mergeMethods.mergeCommit, "merge commits", failures);
  requireEqual(repository.allow_squash_merge, expected.mergeMethods.squash, "squash merges", failures);
  requireEqual(repository.allow_rebase_merge, expected.mergeMethods.rebase, "rebase merges", failures);
  requireEqual(repository.delete_branch_on_merge, expected.deleteBranchOnMerge, "delete branch on merge", failures);

  for (const [key, policy] of Object.entries(expected.rulesets)) {
    const candidates = rulesets.filter((ruleset) => ruleset.name === policy.name);
    if (candidates.length !== 1) {
      failures.push(`${key} ruleset: expected exactly one matching ruleset, found ${candidates.length}`);
      continue;
    }
    const ruleset = candidates[0];
    requireEqual(ruleset.target, policy.target, `${key} target`, failures);
    requireEqual(ruleset.enforcement, policy.enforcement, `${key} enforcement`, failures);
    if (!sameValues(ruleset.conditions?.ref_name?.include, policy.include)) {
      failures.push(`${key} include: expected ${policy.include.join(", ")}`);
    }
    if (!sameValues(ruleset.conditions?.ref_name?.exclude, policy.exclude)) {
      failures.push(`${key} exclude: expected ${policy.exclude.join(", ")}`);
    }
    if (!sameValues(ruleset.bypass_actors, policy.bypassActors)) {
      failures.push(`${key} bypass actors do not match committed policy`);
    }
    const rules = values(ruleset.rules);
    const types = rules.map((rule) => rule.type);
    if (!sameValues(types, policy.requiredRules)) {
      failures.push(`${key} rules: expected ${policy.requiredRules.join(", ")}; got ${types.join(", ")}`);
    }
    if (policy.target === "branch") {
      const pull = rules.find((rule) => rule.type === "pull_request")?.parameters;
      if (!sameValues(pull?.allowed_merge_methods, configuredMergeMethods(expected))) {
        failures.push(`${key} merge methods: expected ${configuredMergeMethods(expected).join(", ")}`);
      }
      requireEqual(pull?.require_extra_approval_for_unattributed_changes,
        policy.requireExtraApprovalForUnattributedChanges, `${key} unattributed-change approval`, failures);
      requireEqual(pull?.required_review_thread_resolution,
        policy.requiredReviewThreadResolution, `${key} review-thread resolution`, failures);
      const checks = rules.find((rule) => rule.type === "required_status_checks")?.parameters;
      const contexts = values(checks?.required_status_checks).map((check) => check.context);
      if (!sameValues(contexts, policy.requiredStatusChecks)) {
        failures.push(`${key} required checks: expected ${policy.requiredStatusChecks.join(", ")}; got ${contexts.join(", ")}`);
      }
      requireEqual(checks?.strict_required_status_checks_policy,
        policy.requireBranchUpToDate, `${key} current-with-main`, failures);
      requireEqual(checks?.do_not_enforce_on_create,
        policy.doNotEnforceOnCreate, `${key} create enforcement`, failures);
    }
  }
  return failures;
}
