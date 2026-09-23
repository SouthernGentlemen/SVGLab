import { readFile } from "node:fs/promises";
import { adminToken, applyGithubSettings } from "./github-settings-provider.mjs";

const expected = JSON.parse(await readFile(new URL("../config/github-repository-settings.json", import.meta.url), "utf8"));
try {
  await applyGithubSettings(expected, { token: adminToken() });
  console.log(`GitHub settings applied and independently verified for ${expected.repository}.`);
} catch (error) {
  console.error(error.message);
  if (["GITHUB_AUTH_REQUIRED", "GITHUB_ADMIN_WRITE_DENIED", "GITHUB_ADMIN_READ_DENIED"].includes(error.code)) {
    console.error("Use GH_ADMIN_TOKEN or an authorized GH_TOKEN with Repository Administration write access.");
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}
