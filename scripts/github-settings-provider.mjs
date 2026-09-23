import { compareGithubRepositorySettings, rulesetPayload } from "../pipelines/guards/github-settings-policy.mjs";

const API_VERSION = "2026-03-10";

export function adminToken() {
  return process.env.GH_ADMIN_TOKEN || process.env.GH_TOKEN || "";
}

export async function githubApi(path, { token, method = "GET", body, fetchImpl = fetch } = {}) {
  if (!token) {
    const error = new Error("GH_ADMIN_TOKEN or GH_TOKEN is required for GitHub settings access");
    error.code = "GITHUB_AUTH_REQUIRED";
    throw error;
  }
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "svglab-repository-settings",
      "x-github-api-version": API_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) {
    const role = method === "GET" ? "read" : "write";
    const error = new Error(`GitHub Repository Administration ${role} access denied (HTTP ${response.status}) for ${path}`);
    error.code = role === "read" ? "GITHUB_ADMIN_READ_DENIED" : "GITHUB_ADMIN_WRITE_DENIED";
    throw error;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`GitHub API ${method} ${path} failed (HTTP ${response.status}): ${data.message ?? response.statusText}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchLiveGithubSettings(expected, { token, fetchImpl = fetch } = {}) {
  const root = `/repos/${expected.repository}`;
  const repository = await githubApi(root, { token, fetchImpl });
  const summaries = await githubApi(`${root}/rulesets?includes_parents=false`, { token, fetchImpl });
  const rulesets = [];
  for (const summary of summaries) {
    rulesets.push(await githubApi(`${root}/rulesets/${summary.id}`, { token, fetchImpl }));
  }
  return { repository, rulesets };
}

export async function applyGithubSettings(expected, { token, fetchImpl = fetch } = {}) {
  const root = `/repos/${expected.repository}`;
  await fetchLiveGithubSettings(expected, { token, fetchImpl });
  await githubApi(root, {
    token, fetchImpl, method: "PATCH",
    body: {
      default_branch: expected.defaultBranch,
      allow_merge_commit: expected.mergeMethods.mergeCommit,
      allow_squash_merge: expected.mergeMethods.squash,
      allow_rebase_merge: expected.mergeMethods.rebase,
      delete_branch_on_merge: expected.deleteBranchOnMerge,
    },
  });
  const summaries = await githubApi(`${root}/rulesets?includes_parents=false`, { token, fetchImpl });
  for (const policy of Object.values(expected.rulesets)) {
    const payload = rulesetPayload(expected, policy);
    const current = summaries.find((summary) => summary.name === policy.name);
    await githubApi(current ? `${root}/rulesets/${current.id}` : `${root}/rulesets`, {
      token, fetchImpl, method: current ? "PUT" : "POST", body: payload,
    });
  }
  const actual = await fetchLiveGithubSettings(expected, { token, fetchImpl });
  const failures = compareGithubRepositorySettings(expected, actual.repository, actual.rulesets);
  if (failures.length) {
    const error = new Error(`GitHub settings were applied but independent re-read found drift:\n${failures.join("\n")}`);
    error.code = "GITHUB_POST_APPLY_VERIFY_FAILED";
    throw error;
  }
  return actual;
}
