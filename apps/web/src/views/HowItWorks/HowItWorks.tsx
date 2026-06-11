import { useEffect } from "react";
import type { ReactNode } from "react";
import { Problem } from "./sections/Problem";
import { StoreInstall } from "./sections/StoreInstall";
import { Lockfile } from "./sections/Lockfile";
import { Reconcile } from "./sections/Reconcile";
import { BreakIt } from "./sections/BreakIt";
import { Profiles } from "./sections/Profiles";
import { Sharing } from "./sections/Sharing";
import { Ci } from "./sections/Ci";

export interface SectionDef {
  n: string;
  title: string;
  body: ReactNode;
}

const SECTIONS: SectionDef[] = [
  { n: "1", title: "Thirty skills. All of them. All the time.", body: <Problem /> },
  { n: "2", title: "Install puts content in one place: the store", body: <StoreInstall /> },
  { n: "3", title: "The lockfile: pinned by default, rollback for free", body: <Lockfile /> },
  { n: "4", title: "Reconcile: two passes, one ownership rule", body: <Reconcile /> },
  { n: "5", title: "Try to break it", body: <BreakIt /> },
  { n: "6", title: "Profiles: one switch, every agent", body: <Profiles /> },
  { n: "7", title: "Sharing: the loadout travels in the URL", body: <Sharing /> },
  { n: "8", title: "loadout check: drift fails the build", body: <Ci /> },
];

export function HowItWorks() {
  useEffect(() => {
    document.title = "Loadout — How it works";
    return () => {
      document.title = "Loadout";
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="/" className="flex items-baseline gap-2">
          <span className="w-3 h-3 bg-accent rounded-[3px] translate-y-px" aria-hidden="true" />
          <span className="font-bold tracking-tight text-[17px]">Loadout</span>
        </a>
        <nav aria-label="Main navigation" className="flex items-center gap-5 text-[13.5px]">
          <a href="/#share" className="text-ink-soft hover:text-ink">Share a loadout</a>
          <a
            href="https://github.com/Rohithgilla12/loadout"
            aria-label="Star Loadout on GitHub"
            className="border border-line-strong rounded px-3 py-1 hover:border-ink-faint font-medium"
          >
            ★ Star on GitHub
          </a>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 blueprint" aria-hidden />
        <div className="relative max-w-3xl mx-auto px-6 pt-14 pb-16">
          <time dateTime="2026-06" className="rise-in font-mono text-[12px] text-accent-deep tracking-wide mb-4 block">
            ENGINEERING · JUNE 2026
          </time>
          <h1 className="rise-in rise-in-1 text-[clamp(2rem,4.5vw,3rem)] leading-[1.06] font-bold tracking-[-0.03em]">
            How Loadout works
          </h1>
          <p className="rise-in rise-in-2 text-[16px] text-ink-soft mt-5 max-w-xl leading-relaxed">
            Loadout turns your pile of agent skills into switchable profiles. This post follows one
            skill through the whole machine — the store, the lockfile, the symlink reconciler, and
            the sharing format. Every diagram below is <strong className="text-ink font-semibold">live</strong>:
            the simulations run the same algorithm as the app, ported line-for-line from the Rust.
          </p>
        </div>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.n} className="max-w-3xl mx-auto px-6 py-12 border-t border-line">
          <div className="font-mono text-[12px] text-accent-deep mb-2">§{s.n}</div>
          <h2 className="text-[24px] font-bold tracking-tight mb-5">{s.title}</h2>
          {s.body}
        </section>
      ))}

      <section className="border-t border-line bg-paper-sunken/60">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-[22px] font-bold tracking-tight">That's the whole machine.</h2>
          <p className="text-[14px] text-ink-soft mt-2 max-w-lg">
            A content store, a lockfile, a two-pass reconciler with one strict ownership rule, and a
            URL format. If it earns a spot in your kit:
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <a
              href="https://github.com/Rohithgilla12/loadout/releases"
              className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-5 py-2.5 rounded-md text-[14px] transition-colors"
            >
              Download Loadout
            </a>
            <a
              href="https://github.com/Rohithgilla12/loadout"
              className="border border-ink rounded-md px-5 py-2.5 font-semibold text-[14px] hover:bg-ink hover:text-paper transition-colors"
            >
              Read the source
            </a>
            <a href="/#share" className="text-[14px] text-accent-deep underline underline-offset-2">
              Share your loadout →
            </a>
          </div>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-6 py-8 text-[12.5px] text-ink-faint">
        MIT licensed. Built in the open by{" "}
        <a className="text-ink-soft hover:text-ink underline underline-offset-2" href="https://github.com/Rohithgilla12">
          Rohith Gilla
        </a>
        .
      </footer>
    </div>
  );
}
