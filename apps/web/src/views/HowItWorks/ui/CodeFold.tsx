export function CodeFold({ title, code, lang = "rust" }: { title: string; code: string; lang?: string }) {
  return (
    <details className="border border-line rounded-lg bg-paper-raised mt-5">
      <summary className="px-3 py-2 text-[12.5px] font-mono text-ink-soft cursor-pointer select-none hover:text-ink">
        <span className="text-accent-deep">{"</>"}</span> {title}{" "}
        <span className="text-ink-faint">· {lang} · verbatim from the repo</span>
      </summary>
      <pre className="px-4 py-3 border-t border-line overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
        {code}
      </pre>
    </details>
  );
}
