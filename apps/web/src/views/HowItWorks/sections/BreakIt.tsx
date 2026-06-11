import { useState } from "react";
import { Prose } from "../ui/Prose";
import { CodeFold } from "../ui/CodeFold";
import { FileTree } from "../ui/FileTree";
import {
  applySteps,
  childrenOf,
  isLoadoutOwned,
  normalize,
  reconcileDir,
  type SimFS,
  type Summary,
  HOME,
} from "../sim/simEngine";
import { CLAUDE_DIR, initialAgentFs, storePathFor, targetsFor, SKILLS } from "../sim/fixtures";
import { SNIPPET_JOURNAL, SNIPPET_CLOBBER_TEST } from "./snippets";

/** Names of entries in the agent dir that Loadout does NOT own. */
function foreignNames(fs: SimFS): Set<string> {
  return new Set(
    childrenOf(fs, CLAUDE_DIR)
      .filter((p) => !isLoadoutOwned(fs, p))
      .map((p) => p.slice(p.lastIndexOf("/") + 1)),
  );
}

export function BreakIt() {
  const [fs, setFs] = useState<SimFS>(initialAgentFs);
  const [name, setName] = useState("frontend-design");
  const [journal, setJournal] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [runs, setRuns] = useState(0);
  const [eaten, setEaten] = useState(0);

  function plant(kind: "file" | "dir" | "symlink") {
    const clean = name.trim().replace(/[/\s]/g, "-") || "my-file";
    const path = `${CLAUDE_DIR}/${clean}`;
    if (fs.has(normalize(path))) return;
    const next = new Map(fs);
    next.set(
      path,
      kind === "symlink" ? { kind: "symlink", target: `${HOME}/elsewhere/${clean}` } : { kind },
    );
    setFs(next);
  }

  function deleteFromStore(skillName: string) {
    const skill = SKILLS.find((s) => s.name === skillName);
    if (!skill) return;
    const next = new Map(fs);
    next.delete(normalize(storePathFor(skill)));
    setFs(next);
  }

  function run(from: SimFS) {
    const before = foreignNames(from);
    const r = reconcileDir(from, CLAUDE_DIR, targetsFor("frontend"));
    const after = foreignNames(r.fs);
    let lost = 0;
    for (const n of before) if (!after.has(n)) lost += 1;
    setEaten((e) => e + lost);
    setRuns((n) => n + 1);
    setSummary(r.summary);
    setFs(r.fs);
  }

  function killMidApply() {
    const r = reconcileDir(fs, CLAUDE_DIR, targetsFor("frontend"));
    setFs(applySteps(fs, r.steps, Math.ceil(r.steps.length / 2)));
    setSummary(null);
    setJournal(true);
  }

  const btn =
    "border border-line-strong rounded px-3 py-1.5 text-[12.5px] font-medium hover:border-ink-faint disabled:opacity-40";

  return (
    <div>
      <Prose>
        <p>
          A tool that deletes symlinks in <code>~/.claude/skills</code> has exactly one
          release-blocking requirement: <strong>it must never delete anything that's yours</strong>.
          This sandbox runs the real algorithm against the <code>frontend</code> profile. Plant
          files. Name one <code>frontend-design</code> so it collides with a managed skill. Delete
          content out from under the store. Kill an apply halfway. The scoreboard is at the bottom.
        </p>
      </Prose>

      <div className="border border-line rounded-lg bg-paper-raised p-3 mb-4 flex flex-col gap-3" role="group" aria-label="Sandbox controls">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-line-strong rounded px-2.5 py-1.5 font-mono text-[12.5px] bg-paper w-44"
            aria-label="name for your planted entry"
          />
          <button className={btn} onClick={() => plant("file")}>plant file</button>
          <button className={btn} onClick={() => plant("dir")}>plant dir</button>
          <button className={btn} onClick={() => plant("symlink")}>plant symlink → ~/elsewhere</button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {targetsFor("frontend").map(([n]) => (
            <button key={n} className={btn} onClick={() => deleteFromStore(n)}>
              rm store copy of {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-4 py-1.5 rounded text-[12.5px]"
            onClick={() => { setJournal(false); run(fs); }}
          >
            run apply (frontend)
          </button>
          <button className={btn} onClick={killMidApply} disabled={journal}>
            ⚡ kill it mid-apply
          </button>
          {journal && (
            <button
              className="rise-in border border-warn rounded px-3 py-1.5 text-[12.5px] font-medium text-warn"
              onClick={() => { setJournal(false); run(fs); }}
            >
              ↻ relaunch app (journal found → re-apply)
            </button>
          )}
        </div>
      </div>

      <FileTree fs={fs} dir={CLAUDE_DIR} />

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px] text-ink-soft" role="status" aria-live="polite">
        <span>applies run: {runs}</span>
        <span className="text-ok font-semibold">your files eaten: {eaten}</span>
        {journal && <span className="text-warn">journal on disk — apply incomplete</span>}
        {summary && summary.skippedConflicts.length > 0 && (
          <span className="basis-full text-warn">
            skipped_conflicts: {summary.skippedConflicts.join(" · ")}
          </span>
        )}
      </div>

      <Prose>
        <p className="mt-6">
          Two mechanisms are doing the work. The name collision and store-deletion cases fall out of
          pass 2: a foreign entry with a managed name is reported in{" "}
          <code>skipped_conflicts</code>, never replaced; missing store content is reported, never
          half-linked. The kill case is the <strong>journal</strong>: Loadout writes its intent to
          disk before mutating anything, and on launch a leftover journal means "re-apply
          everything" — safe precisely because reconcile is idempotent.
        </p>
      </Prose>

      <CodeFold title="apply.rs · journal write + recover_if_needed" code={SNIPPET_JOURNAL} />
      <CodeFold title="apply.rs · the never-clobber test" code={SNIPPET_CLOBBER_TEST} />
    </div>
  );
}
