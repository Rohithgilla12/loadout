import { useState } from "react";
import { Prose } from "../ui/Prose";
import {
  decodeLoadout,
  encodeLoadout,
  toLoadoutJson,
  type SharedLoadout,
} from "../../../lib/share";
import { PROFILES, SKILLS } from "../sim/fixtures";

export function Sharing() {
  const [selected, setSelected] = useState<Set<string>>(new Set(PROFILES.frontend));
  const [tab, setTab] = useState<"url" | "decoded" | "json">("url");

  const loadout: SharedLoadout = {
    by: "you",
    profile: "frontend",
    skills: SKILLS.filter((s) => selected.has(s.name)).map((s) => ({
      source: s.source,
      skill: s.name,
      ...(s.rev ? { rev: s.rev } : {}),
    })),
  };
  const encoded = encodeLoadout(loadout);
  const url = `https://loadout.gilla.fun/#L=${encoded}`;

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  }

  const tabBtn = (t: typeof tab, label: string) => (
    <button
      id={`share-tab-${t}`}
      onClick={() => setTab(t)}
      role="tab"
      aria-selected={tab === t}
      className={
        tab === t
          ? "bg-ink text-paper text-[12px] font-medium px-3 py-1 rounded-t"
          : "text-ink-soft hover:text-ink text-[12px] px-3 py-1"
      }
    >
      {label}
    </button>
  );

  return (
    <div>
      <Prose>
        <p>
          "Share your loadout" had one design constraint: <strong>no accounts, no database, no
          server reads your skill list</strong>. So the entire loadout travels in the URL fragment —{" "}
          <code>#L=</code> followed by base64url-encoded JSON. Fragments are never sent in HTTP
          requests; the receiving page decodes everything client-side.
        </p>
        <p>
          This demo is not a mock. It imports <code>encodeLoadout</code> and{" "}
          <code>decodeLoadout</code> from the same <code>lib/share.ts</code> the share page uses.
          Toggle skills and watch the fragment change:
        </p>
      </Prose>

      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Skills to include">
        {SKILLS.map((s) => (
          <button
            key={s.name}
            onClick={() => toggle(s.name)}
            aria-pressed={selected.has(s.name)}
            className={
              selected.has(s.name)
                ? "bg-accent text-paper-raised text-[11.5px] font-mono px-2.5 py-1 rounded-full"
                : "border border-line-strong text-ink-faint hover:text-ink text-[11.5px] font-mono px-2.5 py-1 rounded-full"
            }
          >
            {selected.has(s.name) ? "✓ " : ""}{s.name}
          </button>
        ))}
      </div>

      <div>
        <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Share output format">
          {tabBtn("url", "share URL")}
          {tabBtn("decoded", "decoded")}
          {tabBtn("json", "loadout.json")}
        </div>
        <div className="border border-t-0 border-line rounded-b-lg bg-paper-raised" role="tabpanel" aria-labelledby={`share-tab-${tab}`}>
          {tab === "url" && (
            <div className="p-4">
              <div className="font-mono text-[11.5px] leading-relaxed break-all text-ink-soft">
                <span className="text-ink-faint">https://loadout.gilla.fun/</span>
                <span className="text-accent-deep">#L=</span>
                {encoded}
              </div>
              <a
                href={`/#L=${encoded}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-3 text-[12.5px] text-accent-deep underline underline-offset-2"
              >
                open this link for real →
              </a>
              <span className="ml-3 font-mono text-[11px] text-ink-faint">{url.length} chars</span>
            </div>
          )}
          {tab === "decoded" && (
            <pre className="p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
              {JSON.stringify(decodeLoadout(encoded), null, 2)}
            </pre>
          )}
          {tab === "json" && (
            <pre className="p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
              {toLoadoutJson(loadout)}
            </pre>
          )}
        </div>
      </div>

      <Prose>
        <p className="mt-6">
          The <code>loadout.json</code> tab is the team story: commit that file to a repo and{" "}
          <code>loadout apply</code> gives every teammate the identical, rev-pinned skill set. For
          prettier links there's an optional short-link API (<code>/s/your-slug</code>, Workers KV,
          immutable once created) — but the fragment format means sharing works even if that server
          disappears.
        </p>
      </Prose>
    </div>
  );
}
