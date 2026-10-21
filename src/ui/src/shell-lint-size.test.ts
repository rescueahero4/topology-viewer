import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "../../..");
const TIME_OUT = 180_000;

// why: ISSUE-012 C10 (SA §5 Module size) — a shell test file above 400 lines fails `pnpm lint`;
// the text is linted at the path of a real test file, as in shell-lint.test.ts, so no file is made
const HOST = path.join(REPO, "packages/ui/src/strings.test.ts");

const eslint = new ESLint({
  cwd: REPO,
  overrideConfigFile: path.join(REPO, "scripts", "eslint.config.mjs"),
});

async function errorsOf(lines: number): Promise<string[]> {
  const body = Array.from(
    { length: lines },
    (_, i) => `export const v${i} = ${i};`,
  );
  const [result] = await eslint.lintText(`${body.join("\n")}\n`, {
    filePath: HOST,
  });
  return result.messages
    .filter((m) => m.severity === 2)
    .map((m) => m.ruleId ?? "");
}

describe("C10 max-lines on the shell test files", () => {
  it(
    "gives one max-lines error at 401 lines and none at 400",
    async () => {
      expect(await errorsOf(401)).toEqual(["max-lines"]);
      expect(await errorsOf(400)).toEqual([]);
    },
    TIME_OUT,
  );
});
