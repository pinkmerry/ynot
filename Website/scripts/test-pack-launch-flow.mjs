import { spawnSync } from "node:child_process";
import { test } from "node:test";

const scripts = [
  "test-pack-opening-flow.mjs",
  "test-live-pack-revisions.mjs",
  "test-live-pack-monitor.mjs",
  "test-subsku-image-routing.mjs",
];

test("pack launch regression suite", () => {
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ["--test", `scripts/${script}`], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(
        `${script} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      );
    }
  }
});
