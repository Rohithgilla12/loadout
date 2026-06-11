import { useState } from "react";
import { Prose } from "../ui/Prose";
import { CodeFold } from "../ui/CodeFold";
import { SNIPPET_STORE } from "./snippets";

const LOCK_ENTRY = `{
  "frontend-design": {
    "name": "frontend-design",
    "source": "github.com/anthropics/skills",
    "url": "https://github.com/anthropics/skills.git",
    "rev": "9b1f3c2",
    "track": "pinned",
    "description": "Create distinctive, production-grade interfaces",
    "installed_at": "2026-06-11T09:14:02Z"
  }
}`;

function TreeLine({ depth, text, on, ghost }: { depth: number; text: string; on?: boolean; ghost?: boolean }) {
  return (
    <div
      className={`font-mono text-[12px] leading-[1.8] ${on ? "rise-in text-ink" : ghost ? "text-ink-faint/40" : "text-ink-soft"}`}
      style={{ paddingLeft: depth * 16 }}
    >
      {text}
    </div>
  );
}

export function StoreInstall() {
  // 0 = not installed, 1 = installed, 2 = second install attempted
  const [stage, setStage] = useState(0);
  return (
    <div>
      <Prose>
        <p>
          Installing a skill never copies it into an agent directory. Content goes to one place:
          the store at <code>~/.loadout/store</code>, addressed by{" "}
          <strong>(source, revision, name)</strong>. A skill fetched from a git repo lands under
          the exact commit it came from; skills you wrote yourself live under{" "}
          <code>local/</code>.
        </p>
        <p>
          Store content is <strong>immutable per (source, rev)</strong>. Install the same skill at
          the same revision twice — from two profiles, two projects, whatever — and the second
          install is a no-op. Try it:
        </p>
      </Prose>

      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="border border-line rounded-lg bg-paper-raised p-4 w-full sm:w-56">
          <div className="font-mono text-[13px] font-medium">frontend-design</div>
          <div className="text-[11.5px] text-ink-faint mt-0.5">github.com/anthropics/skills</div>
          <div className="font-mono text-[11px] text-ink-faint">@ 9b1f3c2</div>
          <button
            onClick={() => setStage(stage === 0 ? 1 : 2)}
            aria-disabled={stage === 2}
            className="mt-3 w-full bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-3 py-1.5 rounded text-[12.5px] transition-colors"
          >
            {stage === 0 ? "Install" : "Install again"}
          </button>
          {stage === 2 && (
            <div className="rise-in mt-2 text-[11.5px] font-mono text-ok" role="status" aria-live="polite">
              already exists — 0 bytes copied
            </div>
          )}
        </div>

        <div className="border border-line rounded-lg bg-paper-raised overflow-hidden" role="region" aria-label="Store directory tree">
          <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
            ~/.loadout/store/
          </div>
          <div className="p-3">
            <TreeLine depth={0} text="github.com/anthropics/skills/" ghost={stage === 0} />
            <TreeLine depth={1} text="9b1f3c2/" ghost={stage === 0} />
            {stage > 0 && <TreeLine depth={2} text="frontend-design/" on />}
            {stage > 0 && <TreeLine depth={3} text="SKILL.md" on />}
            <TreeLine depth={0} text="github.com/vercel-labs/agent-skills/" />
            <TreeLine depth={1} text="4e8d7aa/vercel-react-best-practices/" />
            <TreeLine depth={0} text="local/" />
            <TreeLine depth={1} text="internal-comms/" />
          </div>
        </div>
      </div>

      {stage > 0 && (
        <div className="rise-in mt-4 border border-line rounded-lg bg-paper-raised overflow-hidden">
          <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
            ~/.loadout/lock.json — new entry
          </div>
          <pre className="px-4 py-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
            {LOCK_ENTRY}
          </pre>
        </div>
      )}

      <CodeFold title="store.rs · copy_into_store" code={SNIPPET_STORE} />
    </div>
  );
}
