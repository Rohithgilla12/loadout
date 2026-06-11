import { useState } from "react";
import { Prose } from "../ui/Prose";

const PILE = [
  "frontend-design", "tailwind", "react-best-practices", "testing-guidelines",
  "doc-coauthoring", "internal-comms", "go-concurrency", "grpc-conventions",
  "sql-migrations", "k8s-debugging", "terraform", "pdf-tools", "xlsx", "pptx",
  "brand-guidelines", "security-review", "api-design", "changelog-writing",
  "i18n", "accessibility", "performance", "code-review", "commit-style",
  "release-notes", "slack-gif-creator", "data-viz", "prompt-engineering",
  "mcp-builder", "cli-design", "video-editing",
];

const AGENT_DIRS = ["~/.claude/skills", "~/.cursor/skills", "~/.agents/skills"];

export function Problem() {
  const [dir, setDir] = useState(0);
  return (
    <div>
      <Prose>
        <p>
          Agent skills are great until you have thirty of them. Every installed skill is injected
          into <strong>every session of every agent</strong> — your React design guidelines tag
          along while you write Go, your PowerPoint skill rides shotgun in a Rust refactor. They
          burn context tokens, and overlapping descriptions degrade skill triggering. The only off
          switch today is uninstalling.
        </p>
        <p>Click through the agent directories. Notice anything?</p>
      </Prose>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {AGENT_DIRS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDir(i)}
            className={
              dir === i
                ? "bg-accent text-paper-raised text-[12px] font-mono px-3 py-1 rounded-full"
                : "border border-line-strong text-ink-soft hover:text-ink text-[12px] font-mono px-3 py-1 rounded-full"
            }
          >
            {d}
          </button>
        ))}
      </div>

      <div key={dir} className="border border-line rounded-lg bg-paper-raised p-3">
        <div className="flex flex-wrap gap-1.5">
          {PILE.map((s, i) => (
            <span
              key={s}
              className="rise-in font-mono text-[11px] px-2 py-0.5 rounded border border-accent/40 bg-accent-wash text-accent-deep"
              style={{ animationDelay: `${i * 0.012}s` }}
            >
              ● {s}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-paper-sunken border border-line overflow-hidden">
            <div className="h-full w-full bg-accent" />
          </div>
          <span className="font-mono text-[11.5px] text-ink-soft shrink-0">30/30 active, every session</span>
        </div>
      </div>

      <Prose>
        <p className="mt-6">
          Same pile, every directory, all lit. Loadout's answer is{" "}
          <strong>profiles</strong> — named skill sets you switch between — backed by three pieces
          of machinery: a store, a lockfile, and a reconciler. The rest of this post walks one
          skill, <code>frontend-design</code>, through all three.
        </p>
      </Prose>
    </div>
  );
}
