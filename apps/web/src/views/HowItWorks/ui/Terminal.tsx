export interface TermLine {
  text: string;
  tone?: "ok" | "drift" | "dim" | "cmd";
}

const TONE: Record<string, string> = {
  ok: "text-[oklch(0.75_0.12_150)]",
  drift: "text-[oklch(0.72_0.17_30)]",
  dim: "text-[oklch(0.55_0.01_70)]",
  cmd: "text-[oklch(0.92_0.005_80)]",
};

export function Terminal({ lines, title = "ci" }: { lines: TermLine[]; title?: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-line-strong bg-[oklch(0.18_0.008_60)] shadow-[0_12px_40px_-18px_rgb(0_0_0/0.4)]">
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-[oklch(0.28_0.01_60)]">
        <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.35_0.01_60)]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.35_0.01_60)]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.35_0.01_60)]" />
        <span className="ml-2 text-[11px] font-mono text-[oklch(0.55_0.01_70)]">{title}</span>
      </div>
      <pre className="px-4 py-3 text-[12px] leading-[1.7] font-mono whitespace-pre-wrap">
        {lines.map((l, i) => (
          <div key={i} className={TONE[l.tone ?? "dim"]}>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}
