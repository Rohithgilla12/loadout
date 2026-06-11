import { useMemo, useState } from "react";
import { Prose } from "../ui/Prose";
import { CodeFold } from "../ui/CodeFold";
import { FileTree } from "../ui/FileTree";
import { StepPlayer } from "../ui/StepPlayer";
import { applySteps, reconcileDir, type SimFS } from "../sim/simEngine";
import { CLAUDE_DIR, initialAgentFs, targetsFor } from "../sim/fixtures";
import { SNIPPET_OWNERSHIP, SNIPPET_RECONCILE } from "./snippets";

const PROFILE_CHOICES = ["writing", "frontend", "everything"];

export function Reconcile() {
  const [fsBase, setFsBase] = useState<SimFS>(initialAgentFs);
  const [profile, setProfile] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const result = useMemo(
    () => (profile ? reconcileDir(fsBase, CLAUDE_DIR, targetsFor(profile)) : null),
    [fsBase, profile],
  );
  const visible = result ? applySteps(fsBase, result.steps, index) : fsBase;
  const highlight = result && index > 0 ? result.steps[index - 1].path : null;
  const done = result !== null && index >= result.steps.length;

  function pick(p: string) {
    setFsBase(result ? result.fs : fsBase);
    setProfile(p);
    setIndex(0);
  }

  return (
    <div>
      <Prose>
        <p>
          Agent directories like <code>~/.claude/skills</code> contain <strong>symlinks into the
          store</strong> — that's all "active" means. Switching profiles runs a reconciler that
          makes the directory contain exactly one link per skill in the profile. It has two passes
          and one rule.
        </p>
        <p>
          <strong>The rule:</strong> Loadout owns an entry if and only if it is a symlink whose
          target resolves into the store. The resolution is lexical, so a broken link (store
          content pruned) is still owned and still cleaned up. Everything else — your files, your
          dirs, your symlinks to somewhere else — is <strong>foreign, and never touched</strong>.
        </p>
        <p>
          <strong>Pass 1</strong> walks the directory and removes owned links that shouldn't be
          there. <strong>Pass 2</strong> creates the missing ones. Below is a real starting state:
          the <code>writing</code> profile applied, plus two foreign entries (<code>my-notes</code>,{" "}
          <code>team-link</code>). Pick a profile and step through:
        </p>
      </Prose>

      <div className="flex gap-1.5 mb-4 flex-wrap" role="tablist" aria-label="Profile to switch to">
        {PROFILE_CHOICES.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={profile === p}
            onClick={() => pick(p)}
            className={
              profile === p
                ? "bg-accent text-paper-raised text-[12.5px] font-medium px-3 py-1 rounded-full"
                : "border border-line-strong text-ink-soft hover:text-ink text-[12.5px] px-3 py-1 rounded-full"
            }
          >
            switch to {p}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_minmax(220px,260px)] gap-4 items-start">
        <FileTree fs={visible} dir={CLAUDE_DIR} highlight={highlight} />
        <div>
          {result ? (
            <StepPlayer steps={result.steps} index={index} onIndexChange={setIndex} />
          ) : (
            <div className="text-[12.5px] text-ink-faint">pick a profile to run reconcile</div>
          )}
          {done && result && (
            <div className="rise-in mt-3 font-mono text-[11.5px] text-ink-soft border border-line rounded p-2 bg-paper-sunken" role="status">
              ApplySummary {"{"} added: {result.summary.added}, removed: {result.summary.removed},
              unchanged: {result.summary.unchanged}, conflicts: {result.summary.skippedConflicts.length} {"}"}
            </div>
          )}
        </div>
      </div>

      <Prose>
        <p className="mt-6">
          Three properties fall out of this design. It's <strong>idempotent</strong> — running it
          twice is a no-op, which is what makes crash recovery trivial (next section). It's{" "}
          <strong>non-destructive</strong> — the ownership rule means there is no code path that
          deletes a file Loadout didn't create. And it's <strong>instant</strong> — switching
          profiles rewrites a handful of symlinks, no copying.
        </p>
      </Prose>

      <CodeFold title="apply.rs · is_loadout_owned" code={SNIPPET_OWNERSHIP} />
      <CodeFold title="apply.rs · reconcile_dir (both passes)" code={SNIPPET_RECONCILE} />
    </div>
  );
}
