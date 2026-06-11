import { type SimFS, childrenOf, isLoadoutOwned, normalize } from "../sim/simEngine";

export function FileTree({
  fs,
  dir,
  label,
  highlight,
}: {
  fs: SimFS;
  dir: string;
  label?: string;
  highlight?: string | null;
}) {
  const rows = childrenOf(fs, dir);
  return (
    <div className="border border-line rounded-lg bg-paper-raised overflow-hidden">
      <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
        {(label ?? dir).replace("/home/you/", "~/")}/
      </div>
      <div className="p-2 flex flex-col gap-1 min-h-[64px]">
        {rows.length === 0 && <div className="text-[12px] text-ink-faint px-2 py-1">(empty)</div>}
        {rows.map((path) => (
          <Row key={path} fs={fs} path={path} highlighted={highlight === path} />
        ))}
      </div>
    </div>
  );
}

function Row({ fs, path, highlighted }: { fs: SimFS; path: string; highlighted: boolean }) {
  const entry = fs.get(path);
  if (!entry) return null;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const owned = isLoadoutOwned(fs, path);
  const broken = entry.kind === "symlink" && !fs.has(normalize(entry.target));
  return (
    <div
      className={`flex items-center gap-2 font-mono text-[12px] px-2 py-1 rounded border transition-colors ${
        highlighted ? "border-accent bg-accent-wash" : "border-line bg-paper-sunken"
      }`}
    >
      <span className={owned ? "text-accent-deep" : "text-ink-faint"}>
        {entry.kind === "symlink" ? "→" : entry.kind === "dir" ? "▸" : "·"}
      </span>
      <span className="truncate">{name}</span>
      {entry.kind === "symlink" && (
        <span className="text-ink-faint text-[10.5px] truncate hidden sm:inline">
          {entry.target.replace("/home/you/", "~/")}
        </span>
      )}
      <span className="ml-auto text-[10px] uppercase tracking-wide shrink-0">
        {owned ? (
          broken ? (
            <span className="text-warn">owned · broken</span>
          ) : (
            <span className="text-ink-faint">owned</span>
          )
        ) : (
          <span className="text-ok">yours</span>
        )}
      </span>
    </div>
  );
}
