import { useState } from "react";

const PROFILES: Record<string, { skills: string[]; agent: string }> = {
  typescript: {
    skills: ["vercel-react-best-practices", "frontend-design", "tailwind", "testing-guidelines"],
    agent: "~/.claude/skills",
  },
  "go-backend": {
    skills: ["go-concurrency", "grpc-conventions", "sql-migrations"],
    agent: "~/.claude/skills",
  },
  writing: {
    skills: ["doc-coauthoring", "internal-comms"],
    agent: "~/.claude/skills",
  },
};

export function Landing() {
  const [active, setActive] = useState("typescript");

  return (
    <div className="min-h-screen">
      {/* nav */}
      <header className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="w-3 h-3 bg-accent rounded-[3px] translate-y-px" />
          <span className="font-bold tracking-tight text-[17px]">Loadout</span>
        </div>
        <nav className="flex items-center gap-5 text-[13.5px]">
          <a href="#share" className="text-ink-soft hover:text-ink">Share a loadout</a>
          <a
            href="https://github.com/Rohithgilla12/loadout"
            className="border border-line-strong rounded px-3 py-1 hover:border-ink-faint font-medium"
          >
            ★ Star on GitHub
          </a>
        </nav>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 blueprint" aria-hidden />
        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-20 grid md:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <div className="rise-in font-mono text-[12px] text-accent-deep mb-4 tracking-wide">
              FOR CLAUDE CODE · CURSOR · CODEX · COPILOT
            </div>
            <h1 className="rise-in rise-in-1 text-[clamp(2.2rem,5vw,3.4rem)] leading-[1.04] font-bold tracking-[-0.03em]">
              Your agent skills,
              <br />
              in switchable sets.
            </h1>
            <p className="rise-in rise-in-2 text-[16px] text-ink-soft mt-5 max-w-md leading-relaxed">
              Loadout is an open-source desktop app that turns your pile of installed skills into
              named <strong className="text-ink font-semibold">profiles</strong> — equip the right
              kit per project, switch in one click, share with your team.
            </p>
            <div className="rise-in rise-in-3 flex items-center gap-3 mt-8">
              <a
                href="https://github.com/Rohithgilla12/loadout/releases"
                className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-5 py-2.5 rounded-md text-[14px] transition-colors"
              >
                Download for macOS & Linux
              </a>
              <span className="font-mono text-[12px] text-ink-faint">free · MIT · no Node required</span>
            </div>
          </div>

          {/* interactive loadout switcher */}
          <div className="rise-in rise-in-2 border border-line-strong rounded-xl bg-paper-raised shadow-[0_12px_40px_-18px_rgb(0_0_0/0.25)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
              <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
              <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
              <span className="ml-2 text-[12px] text-ink-faint font-mono">my-project</span>
            </div>
            <div className="p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-faint font-semibold mb-2">
                Active profile — try switching
              </div>
              <div className="flex gap-1.5 mb-4">
                {Object.keys(PROFILES).map((p) => (
                  <button
                    key={p}
                    onClick={() => setActive(p)}
                    className={
                      active === p
                        ? "bg-accent text-paper-raised text-[12.5px] font-medium px-3 py-1 rounded-full"
                        : "border border-line-strong text-ink-soft hover:text-ink text-[12.5px] px-3 py-1 rounded-full"
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="font-mono text-[12px] text-ink-faint mb-1.5">
                {PROFILES[active].agent}/
              </div>
              <div className="flex flex-col gap-1" key={active}>
                {PROFILES[active].skills.map((s, i) => (
                  <div
                    key={s}
                    className="rise-in flex items-center gap-2 font-mono text-[12.5px] px-3 py-1.5 bg-paper-sunken rounded border border-line"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <span className="text-accent-deep">→</span> {s}
                    <span className="ml-auto text-ink-faint text-[10.5px]">symlink</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11.5px] text-ink-faint">
                Switching rewrites symlinks. Instant, offline, reversible.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* the problem */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-line">
        <div className="grid md:grid-cols-[280px_1fr] gap-10">
          <h2 className="text-[24px] font-bold tracking-tight leading-tight">
            Thirty skills installed. All of them, all the time.
          </h2>
          <div className="text-[14.5px] text-ink-soft leading-relaxed space-y-4 max-w-xl">
            <p>
              Every installed skill is injected into <em>every</em> agent session — your React
              design guidelines tag along while you write Go, burning context tokens and degrading
              skill triggering. The only off switch today is uninstalling.
            </p>
            <p>
              Skills live scattered across <code className="font-mono text-[12.5px] bg-paper-sunken border border-line rounded px-1">~/.claude/skills</code>,{" "}
              <code className="font-mono text-[12.5px] bg-paper-sunken border border-line rounded px-1">.agents/skills</code> and a dozen other
              directories — no version pinning, no update notifications, no rollback, no team story.
            </p>
          </div>
        </div>
      </section>

      {/* features as a kit checklist */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="font-mono text-[12px] text-accent-deep tracking-wide mb-6">WHAT'S IN THE BOX</div>
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
          {[
            {
              n: "01",
              title: "Profiles",
              body: "Named skill sets, layered: a global base plus per-project assignments. The TypeScript kit for frontend work, the Go kit for services — one click apart.",
            },
            {
              n: "02",
              title: "One screen of truth",
              body: "Every skill, every agent, every version, searchable in one Library. Detail view renders SKILL.md with the full file tree.",
            },
            {
              n: "03",
              title: "Team loadouts",
              body: "Commit loadout.json to a repo and every teammate gets the identical skill environment — reviewed, pinned to exact commits, reproducible.",
            },
            {
              n: "04",
              title: "Safe updates",
              body: "Pinned by default. Loadout notifies when upstream changes, shows the diff on demand, applies in one click, and keeps the previous version for instant rollback.",
            },
            {
              n: "05",
              title: "Trust review",
              body: "Before a skill lands on disk: rendered SKILL.md, file listing with executable scripts flagged, source repo. Skills are instructions for your agent — read them first.",
            },
            {
              n: "06",
              title: "Plays well with others",
              body: "Detects skills installed by npx skills and adopts them cleanly. Same spec, same directories, no lock-in — it's your filesystem.",
            },
          ].map((f) => (
            <div key={f.n} className="flex gap-4">
              <div className="font-mono text-[13px] text-accent-deep pt-0.5 shrink-0">{f.n}</div>
              <div>
                <h3 className="font-semibold text-[15px] mb-1">{f.title}</h3>
                <p className="text-[13.5px] text-ink-soft leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* share teaser */}
      <section className="border-t border-line bg-paper-sunken/60">
        <div className="max-w-5xl mx-auto px-6 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight">“This is my loadout.”</h2>
            <p className="text-[14px] text-ink-soft mt-1 max-w-lg">
              Turn your skill set into a link. Anyone can review it and install it — the whole
              loadout travels in the URL, no account, no server.
            </p>
          </div>
          <a
            href="#share"
            className="shrink-0 border border-ink rounded-md px-5 py-2.5 font-semibold text-[14px] hover:bg-ink hover:text-paper transition-colors"
          >
            Share your loadout →
          </a>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-[12.5px] text-ink-faint">
        <span>
          MIT licensed. Built in the open —{" "}
          <a
            className="text-ink-soft hover:text-ink underline underline-offset-2"
            href="https://github.com/Rohithgilla12/loadout"
          >
            star the repo
          </a>{" "}
          if Loadout earns a spot in your kit.
        </span>
        <div className="flex gap-4">
          <a className="hover:text-ink" href="https://github.com/Rohithgilla12/loadout">GitHub</a>
          <a className="hover:text-ink" href="https://skills.sh">skills.sh</a>
          <a className="hover:text-ink" href="https://agentskills.io">SKILL.md spec</a>
        </div>
      </footer>
    </div>
  );
}
