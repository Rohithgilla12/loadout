import { useState } from "react";
import { Prose } from "../ui/Prose";

const OLD_REV = "9b1f3c2";
const NEW_REV = "4e8d7aa";

export function Lockfile() {
  const [rev, setRev] = useState(OLD_REV);
  const [prevRev, setPrevRev] = useState<string | null>(null);
  const [track, setTrack] = useState<"pinned" | "latest">("pinned");

  const entry = {
    name: "frontend-design",
    source: "github.com/anthropics/skills",
    rev,
    ...(prevRev ? { prev_rev: prevRev } : {}),
    track,
  };

  const btn =
    "border border-line-strong rounded px-3 py-1.5 text-[12.5px] font-medium hover:border-ink-faint disabled:opacity-40 disabled:cursor-default";

  return (
    <div>
      <Prose>
        <p>
          The lockfile is the contract: every skill is <strong>pinned by default</strong> to the
          commit it was installed from. Upstream pushing a new prompt-injection masterpiece to a
          skill repo does not change what runs on your machine. Updates are explicit — and when you
          take one, the previous revision is kept as <code>prev_rev</code> so rollback is one
          click, not an archaeology project.
        </p>
      </Prose>

      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          className={btn}
          disabled={rev === NEW_REV}
          title="Already at the latest revision"
          onClick={() => {
            setPrevRev(rev);
            setRev(NEW_REV);
          }}
        >
          ⬆ Update available → apply
        </button>
        <button
          className={btn}
          disabled={!prevRev}
          title="No previous revision recorded yet"
          onClick={() => {
            const back = prevRev!;
            setPrevRev(rev);
            setRev(back);
          }}
        >
          ↩ Roll back
        </button>
        <button
          className={btn}
          aria-pressed={track === "latest"}
          aria-label="Track latest instead of pinned"
          onClick={() => setTrack(track === "pinned" ? "latest" : "pinned")}
        >
          track: {track} — toggle
        </button>
      </div>

      <div className="border border-line rounded-lg bg-paper-raised overflow-hidden" role="region" aria-label="Lockfile contents" aria-live="polite">
        <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
          ~/.loadout/lock.json
        </div>
        <pre className="px-4 py-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
          {JSON.stringify({ skills: { "frontend-design": entry } }, null, 2)}
        </pre>
      </div>

      <Prose>
        <p className="mt-5">
          Because the store keeps each revision at its own path, "rollback" is not a download — both
          revisions are already on disk. Updating just changes which store path the lockfile points
          at. The next section is about who turns that pointer into reality.
        </p>
      </Prose>
    </div>
  );
}
