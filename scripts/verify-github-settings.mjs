import { readFile } from "node:fs/promises";
import { compareGithubRepositorySettings } from "../pipelines/guards/github-settings-policy.mjs";
import { adminToken, fetchLiveGithubSettings } from "./github-settings-provider.mjs";

const expected = JSON.parse(await readFile(new URL("../config/github-repository-settings.json", import.meta.url), "utf8"));
try {
  const actual = await fetchLiveGithubSettings(expected, { token: adminToken() });
  const failures = compareGithubRepositorySettings(expected, actual.repository, actual.rulesets);
  if (failures.length) {
    console.error(`GitHub settings differ from committed authority:\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`GitHub repository settings match ${expected.repository}.`);
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "GITHUB_AUTH_REQUIRED" || error.code === "GITHUB_ADMIN_READ_DENIED") {
    console.error("Use GH_ADMIN_TOKEN or an authorized GH_TOKEN with Repository Administration read access.");
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}
