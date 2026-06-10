import { useEffect, useMemo, useState } from "react";
import { createShortLink, shareUrl, type SharedLoadout, type SharedSkill } from "../lib/share";

/**
 * "This is my loadout" — paste a loadout.json (exported from the app) or add
 * skills by hand, get a shareable link. Everything stays client-side.
 */
export function Builder() {
  const [by, setBy] = useState("");
  const [profile, setProfile] = useState("");
  const [note, setNote] = useState("");
  const [skills, setSkills] = useState<SharedSkill[]>([]);
  const [manualSource, setManualSource] = useState("");
  const [manualSkill, setManualSkill] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadout: SharedLoadout | null = useMemo(() => {
    if (!profile.trim() || !skills.length) return null;
    return {
      by: by.trim() || undefined,
      profile: profile.trim(),
      note: note.trim() || undefined,
      skills,
    };
  }, [by, profile, note, skills]);

  const longUrl = loadout ? shareUrl(loadout) : null;
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortening, setShortening] = useState(false);
  useEffect(() => setShortUrl(null), [longUrl]);
  const url = shortUrl ?? longUrl;

  const handlePaste = (text: string) => {
    setPasteError(null);
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed.skills) ? parsed.skills : [];
      const imported: SharedSkill[] = [];
      for (const s of list) {
        if (typeof s?.skill === "string" && typeof s?.source === "string" && s.source !== "local") {
          imported.push({ source: s.source, skill: s.skill, rev: s.rev });
        }
      }
      if (!imported.length) {
        setPasteError("No shareable skills found (local skills can't travel in a link).");
        return;
      }
      if (typeof parsed.profile === "string" && !profile) setProfile(parsed.profile);
      setSkills(imported);
    } catch {
      setPasteError("That doesn't parse as JSON.");
    }
  };

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="#" onClick={() => (location.hash = "")} className="flex items-baseline gap-2">
          <span className="w-3 h-3 bg-accent rounded-[3px] translate-y-px" />
          <span className="font-bold tracking-tight text-[17px]">Loadout</span>
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-10 pb-20">
        <h1 className="rise-in text-[clamp(1.8rem,4vw,2.4rem)] font-bold tracking-[-0.025em]">
          Share your loadout
        </h1>
        <p className="rise-in rise-in-1 text-[14.5px] text-ink-soft mt-2 max-w-lg leading-relaxed">
          Build a link that says “this is my kit.” The loadout is encoded in the URL itself — no
          account, nothing uploaded anywhere.
        </p>

        <div className="rise-in rise-in-2 mt-8 grid gap-5">
          {/* identity */}
          <div className="grid md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Your name</span>
              <input
                value={by}
                onChange={(e) => setBy(e.target.value)}
                placeholder="Rohith"
                className="mt-1 w-full bg-paper-raised border border-line rounded-md px-3 py-2 text-[14px] outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Loadout name *</span>
              <input
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="typescript"
                className="mt-1 w-full bg-paper-raised border border-line rounded-md px-3 py-2 text-[14px] outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">One-liner</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="My daily frontend kit"
                className="mt-1 w-full bg-paper-raised border border-line rounded-md px-3 py-2 text-[14px] outline-none focus:border-accent"
              />
            </label>
          </div>

          {/* paste loadout.json */}
          <div className="border border-line rounded-lg p-4">
            <div className="text-[13px] font-semibold mb-1">
              Paste a loadout.json{" "}
              <span className="font-normal text-ink-faint">
                (in the app: Profiles → Copy loadout.json — or Share… to land here pre-filled)
              </span>
            </div>
            <textarea
              rows={4}
              placeholder='{"profile": "typescript", "skills": [...]}'
              onChange={(e) => e.target.value.trim() && handlePaste(e.target.value)}
              className="w-full font-mono text-[12px] bg-paper-sunken border border-line rounded-md px-3 py-2 outline-none focus:border-accent resize-y"
            />
            {pasteError && <div className="text-[12px] text-warn mt-1">{pasteError}</div>}
          </div>

          {/* manual add */}
          <div className="border border-line rounded-lg p-4">
            <div className="text-[13px] font-semibold mb-2">…or add skills by hand</div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualSource.trim() || !manualSkill.trim()) return;
                setSkills((s) => [
                  ...s,
                  { source: manualSource.trim(), skill: manualSkill.trim() },
                ]);
                setManualSkill("");
              }}
            >
              <input
                value={manualSource}
                onChange={(e) => setManualSource(e.target.value)}
                placeholder="owner/repo"
                className="flex-1 font-mono text-[13px] bg-paper-raised border border-line rounded-md px-3 py-2 outline-none focus:border-accent"
              />
              <input
                value={manualSkill}
                onChange={(e) => setManualSkill(e.target.value)}
                placeholder="skill-name"
                className="flex-1 font-mono text-[13px] bg-paper-raised border border-line rounded-md px-3 py-2 outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="border border-line-strong hover:border-ink-faint rounded-md px-4 text-[13px] font-medium"
              >
                Add
              </button>
            </form>
          </div>

          {/* current list */}
          {skills.length > 0 && (
            <div className="border border-line-strong rounded-lg bg-paper-raised overflow-hidden">
              {skills.map((s, i) => (
                <div
                  key={`${s.source}/${s.skill}-${i}`}
                  className="flex items-center gap-3 px-4 py-2 border-b border-line/60 last:border-0"
                >
                  <span className="font-mono text-[12px] text-accent-deep w-6">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-[13.5px]">{s.skill}</span>
                  <span className="font-mono text-[11.5px] text-ink-faint">
                    {s.source}
                    {s.rev ? ` @ ${s.rev.slice(0, 7)}` : ""}
                  </span>
                  <button
                    onClick={() => setSkills((list) => list.filter((_, j) => j !== i))}
                    className="ml-auto text-ink-faint hover:text-ink text-[13px]"
                    aria-label={`remove ${s.skill}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* result */}
          {url && loadout && (
            <div className="rise-in border-2 border-accent rounded-lg p-4 bg-accent-wash/40">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-semibold">Your share link</div>
                {!shortUrl && (
                  <button
                    onClick={async () => {
                      setShortening(true);
                      const short = await createShortLink(loadout);
                      setShortening(false);
                      if (short) setShortUrl(short);
                    }}
                    disabled={shortening}
                    className="text-[12.5px] font-medium border border-line-strong hover:border-ink-faint rounded-md px-3 py-1 disabled:opacity-50"
                  >
                    {shortening ? "Shortening…" : "Make it short"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 font-mono text-[12px] bg-paper-raised border border-line rounded-md px-3 py-2 outline-none"
                />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-4 rounded-md text-[13px] transition-colors"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <a
                  href={url}
                  className="border border-line-strong hover:border-ink-faint rounded-md px-4 py-2 text-[13px] font-medium"
                >
                  Preview
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
