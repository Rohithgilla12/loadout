import { useState } from "react";
import { toLoadoutJson, type SharedLoadout } from "../lib/share";

export function SharePage({ loadout }: { loadout: SharedLoadout }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  const sources = [...new Set(loadout.skills.map((s) => s.source))];

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="#" onClick={() => (location.hash = "")} className="flex items-baseline gap-2">
          <span className="w-3 h-3 bg-accent rounded-[3px] translate-y-px" />
          <span className="font-bold tracking-tight text-[17px]">Loadout</span>
        </a>
        <a href="#share" className="text-[13.5px] text-ink-soft hover:text-ink">
          Share yours →
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-10 pb-20">
        <div className="rise-in font-mono text-[12px] text-accent-deep tracking-wide mb-3">
          SHARED LOADOUT
        </div>
        <h1 className="rise-in rise-in-1 text-[clamp(1.8rem,4vw,2.6rem)] font-bold tracking-[-0.025em] leading-tight">
          {loadout.by ? `${loadout.by}'s` : "A"} <span className="text-accent-deep">{loadout.profile}</span> loadout
        </h1>
        {loadout.note && (
          <p className="rise-in rise-in-2 text-[15px] text-ink-soft mt-3 max-w-xl leading-relaxed">
            “{loadout.note}”
          </p>
        )}

        {/* kit list */}
        <div className="rise-in rise-in-2 mt-8 border border-line-strong rounded-xl bg-paper-raised overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
            <span className="font-mono text-[12px] text-ink-faint">
              {loadout.skills.length} skill{loadout.skills.length === 1 ? "" : "s"} · {sources.length} source
              {sources.length === 1 ? "" : "s"}
            </span>
            <span className="font-mono text-[12px] text-ink-faint">pinned where noted</span>
          </div>
          {loadout.skills.map((s, i) => (
            <div
              key={`${s.source}/${s.skill}`}
              className="rise-in flex items-center gap-3 px-4 py-2.5 border-b border-line/60 last:border-0"
              style={{ animationDelay: `${0.15 + i * 0.04}s` }}
            >
              <span className="font-mono text-[12px] text-accent-deep w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[14px]">{s.skill}</div>
                <div className="font-mono text-[11.5px] text-ink-faint truncate">
                  {s.source}
                  {s.rev ? ` @ ${s.rev.slice(0, 7)}` : ""}
                </div>
              </div>
              <a
                className="ml-auto shrink-0 text-[12px] text-ink-soft hover:text-ink underline decoration-line-strong"
                href={`https://github.com/${s.source}`}
                target="_blank"
                rel="noreferrer"
              >
                repo ↗
              </a>
            </div>
          ))}
        </div>

        {/* install paths */}
        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <div className="border border-line rounded-lg p-5">
            <h3 className="font-semibold text-[15px]">Install with Loadout</h3>
            <p className="text-[13px] text-ink-soft mt-1 mb-3 leading-relaxed">
              Save this as <code className="font-mono text-[12px] bg-paper-sunken border border-line rounded px-1">loadout.json</code> in
              your repo, then open the project in Loadout and hit “Review &amp; apply”.
            </p>
            <button
              onClick={() => copy("json", toLoadoutJson(loadout))}
              className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-4 py-2 rounded-md text-[13px] transition-colors"
            >
              {copied === "json" ? "Copied ✓" : "Copy loadout.json"}
            </button>
          </div>
          <div className="border border-line rounded-lg p-5">
            <h3 className="font-semibold text-[15px]">Or use the skills CLI</h3>
            <p className="text-[13px] text-ink-soft mt-1 mb-3 leading-relaxed">
              No Loadout yet? Install each skill with{" "}
              <code className="font-mono text-[12px] bg-paper-sunken border border-line rounded px-1">npx skills</code>:
            </p>
            <button
              onClick={() =>
                copy(
                  "cli",
                  sources.map((src) => `npx skills add ${src}`).join("\n"),
                )
              }
              className="border border-line-strong hover:border-ink-faint font-medium px-4 py-2 rounded-md text-[13px] transition-colors"
            >
              {copied === "cli" ? "Copied ✓" : "Copy CLI commands"}
            </button>
          </div>
        </div>

        <div className="mt-10 text-[12.5px] text-ink-faint leading-relaxed border-t border-line pt-5">
          <strong className="text-ink-soft">Before you install:</strong> skills are instructions
          injected into your coding agent. Review each repo — Loadout shows rendered SKILL.md and
          flags executable files before anything lands on disk.
        </div>
      </main>
    </div>
  );
}
