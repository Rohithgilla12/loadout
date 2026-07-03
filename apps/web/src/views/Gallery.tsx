import { useEffect, useState } from "react";
import type { SharedLoadout } from "../lib/share";

interface GalleryLoadout extends SharedLoadout {
  slug: string;
}

export function Gallery() {
  const [data, setData] = useState<GalleryLoadout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/gallery")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-paper-sunken/30 pb-20">
      <header className="bg-paper border-b border-line">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-baseline gap-2 hover:opacity-80">
            <span className="w-3 h-3 bg-accent rounded-[3px] translate-y-px" />
            <span className="font-bold tracking-tight text-[17px]">Loadout</span>
          </a>
          <nav className="flex items-center gap-5 text-[13.5px]">
            <a href="/gallery" className="text-ink font-medium">Gallery</a>
            <a href="/how-it-works" className="text-ink-soft hover:text-ink">How it works</a>
            <a href="/#share" className="text-ink-soft hover:text-ink">Share a loadout</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-12">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold tracking-tight mb-2">Loadout Gallery</h1>
          <p className="text-ink-soft text-[15px]">
            Trending skill kits and starter profiles shared by the community.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-ink-faint text-[14px]">
            Loading loadouts...
          </div>
        ) : error ? (
          <div className="text-accent-deep text-[14px]">
            Failed to load gallery.
          </div>
        ) : data.length === 0 ? (
          <div className="text-ink-soft text-[14px]">
            No featured loadouts yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.map((l) => (
              <a
                key={l.slug}
                href={`/s/${l.slug}`}
                className="block bg-paper border border-line rounded-xl p-5 hover:border-ink-faint hover:shadow-[0_4px_12px_rgb(0_0_0/0.03)] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2 className="font-semibold text-[16px] truncate pr-4">{l.profile}</h2>
                  <span className="shrink-0 bg-paper-sunken border border-line text-ink-soft text-[11px] px-2 py-0.5 rounded font-mono">
                    {l.skills.length} skills
                  </span>
                </div>
                {l.by && (
                  <div className="text-[12.5px] text-ink-soft mb-2">
                    by <span className="font-medium text-ink">{l.by}</span>
                  </div>
                )}
                {l.note && (
                  <p className="text-[13px] text-ink-soft line-clamp-2 mb-4 leading-relaxed">
                    {l.note}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                  {l.skills.slice(0, 5).map((s) => (
                    <span
                      key={s.skill}
                      className="text-[11.5px] font-mono bg-paper-sunken text-ink-soft px-1.5 py-0.5 rounded border border-line/50"
                    >
                      {s.skill}
                    </span>
                  ))}
                  {l.skills.length > 5 && (
                    <span className="text-[11.5px] font-mono text-ink-faint px-1">
                      +{l.skills.length - 5}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
