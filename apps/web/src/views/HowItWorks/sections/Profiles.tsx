import { useState } from "react";
import { Prose } from "../ui/Prose";
import { FileTree } from "../ui/FileTree";
import { reconcileDir, type SimFS } from "../sim/simEngine";
import { AGENTS_DIR, CLAUDE_DIR, PROFILES, multiAgentFs, targetsFor } from "../sim/fixtures";

export function Profiles() {
  const [fs, setFs] = useState<SimFS>(multiAgentFs);
  const [active, setActive] = useState("writing");
  const [last, setLast] = useState<string | null>(null);

  function switchTo(p: string) {
    if (p === active) return;
    const targets = targetsFor(p);
    const r1 = reconcileDir(fs, CLAUDE_DIR, targets);
    const r2 = reconcileDir(r1.fs, AGENTS_DIR, targets);
    setFs(r2.fs);
    setActive(p);
    const added = r1.summary.added + r2.summary.added;
    const removed = r1.summary.removed + r2.summary.removed;
    setLast(`2 dirs reconciled · +${added} −${removed}`);
  }

  return (
    <div>
      <Prose>
        <p>
          A <strong>profile</strong> is just an ordered list of skill names — <code>writing</code>,{" "}
          <code>frontend</code>, <code>everything</code>. Switching means running the §4 reconciler
          once per detected agent directory, with the profile's skills as targets. One click, every
          agent, same kit:
        </p>
      </Prose>

      <div className="flex gap-1.5 mb-4 flex-wrap items-center" role="tablist" aria-label="Profile to switch to">
        {Object.keys(PROFILES).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={active === p}
            onClick={() => switchTo(p)}
            className={
              active === p
                ? "bg-accent text-paper-raised text-[12.5px] font-medium px-3 py-1 rounded-full"
                : "border border-line-strong text-ink-soft hover:text-ink text-[12.5px] px-3 py-1 rounded-full"
            }
          >
            {p} · {PROFILES[p].length} skills
          </button>
        ))}
        {last && (
          <span className="font-mono text-[11.5px] text-ink-faint ml-2" role="status" aria-live="polite">
            {last}
          </span>
        )}
      </div>

      <div key={active} className="grid md:grid-cols-2 gap-4" role="tabpanel" aria-label={`agent directories with the ${active} profile`}>
        <FileTree fs={fs} dir={CLAUDE_DIR} />
        <FileTree fs={fs} dir={AGENTS_DIR} />
      </div>

      <Prose>
        <p className="mt-6">
          Two scopes exist. A <strong>base profile</strong> applies to global agent dirs like the
          ones above. A project can additionally get its own profile, materialized into the repo's
          agent dirs (<code>.claude/skills</code> inside the project) — and{" "}
          <strong>only</strong> the project profile goes there. Base skills stay global, because
          agents already merge global and project directories; duplicating them into every repo
          would just pollute it with symlinks.
        </p>
      </Prose>
    </div>
  );
}
