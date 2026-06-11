import { useState } from "react";
import { Prose } from "../ui/Prose";
import { Terminal, type TermLine } from "../ui/Terminal";

const IN_SYNC: TermLine[] = [
  { text: "$ loadout check", tone: "cmd" },
  { text: "loadout.json declares profile 'frontend' with 3 skills", tone: "dim" },
  { text: "  ✓ frontend-design               github.com/anthropics/skills @ 9b1f3c2", tone: "ok" },
  { text: "  ✓ tailwind                      github.com/anthropics/skills @ 9b1f3c2", tone: "ok" },
  { text: "  ✓ vercel-react-best-practices   github.com/vercel-labs/agent-skills @ 4e8d7aa", tone: "ok" },
  { text: "in sync", tone: "ok" },
  { text: "$ echo $?", tone: "cmd" },
  { text: "0", tone: "dim" },
];

const DRIFTED: TermLine[] = [
  { text: "$ loadout check", tone: "cmd" },
  { text: "loadout.json declares profile 'frontend' with 3 skills", tone: "dim" },
  { text: "  ✓ frontend-design               github.com/anthropics/skills @ 9b1f3c2", tone: "ok" },
  { text: "  ✗ tailwind                      not materialized in your-repo/.claude/skills", tone: "drift" },
  { text: "  ✓ vercel-react-best-practices   github.com/vercel-labs/agent-skills @ 4e8d7aa", tone: "ok" },
  { text: "DRIFT detected", tone: "drift" },
  { text: "$ echo $?", tone: "cmd" },
  { text: "1", tone: "dim" },
];

export function Ci() {
  const [drifted, setDrifted] = useState(false);
  const btn =
    "border border-line-strong rounded px-3 py-1.5 text-[12.5px] font-medium hover:border-ink-faint";
  return (
    <div>
      <Prose>
        <p>
          Everything above also ships as a CLI (<code>loadout switch / apply / check / doctor</code>),
          and <code>loadout check</code> is built for CI: it verifies the committed{" "}
          <code>loadout.json</code> against what's actually materialized and{" "}
          <strong>exits 1 on drift</strong>. A teammate deletes a symlink, a lockfile pin goes stale,
          vendored content goes missing — the pipeline goes red instead of the agent
          quietly running with the wrong kit.
        </p>
      </Prose>

      <div className="flex gap-2 mb-3">
        <button className={btn} onClick={() => setDrifted(!drifted)} aria-pressed={drifted}>
          {drifted ? "restore the symlink" : "rm your-repo/.claude/skills/tailwind"}
        </button>
      </div>

      <Terminal title="your-repo · ci" lines={drifted ? DRIFTED : IN_SYNC} />

      <Prose>
        <p className="mt-6">
          That's a one-line job: <code>loadout check || exit 1</code>. There's also{" "}
          <code>--json</code> for tooling that wants structured findings.
        </p>
      </Prose>
    </div>
  );
}
