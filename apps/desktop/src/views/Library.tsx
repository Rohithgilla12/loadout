import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeApply } from "../lib/api";
import type { LibrarySkill } from "../lib/types";
import { Badge, Button, EmptyState, Input, Mono, SectionLabel, Sha, Spinner, cx } from "../components/ui";
import { SkillMarkdown } from "../components/SkillMarkdown";
import { formatSize } from "../lib/format";
import { useToast } from "../components/Toast";

export function Library() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "updates" | "local">("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const library = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });
  const updates = useQuery({ queryKey: ["updates"], queryFn: api.checkUpdates, staleTime: 1000 * 60 * 60, retry: false });
  const detail = useQuery({
    queryKey: ["skill", selectedName],
    queryFn: () => api.getSkillDetail(selectedName!),
    enabled: !!selectedName,
  });

  const updateMap = useMemo(
    () => new Map((updates.data ?? []).map((u) => [u.name, u.latest])),
    [updates.data],
  );

  const rows = useMemo(() => {
    let list = library.data ?? [];
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q),
      );
    }
    if (filter === "updates") list = list.filter((s) => updateMap.has(s.name));
    if (filter === "local") list = list.filter((s) => s.source === "local");
    return list;
  }, [library.data, search, filter, updateMap]);

  const remove = useMutation({
    mutationFn: api.removeSkill,
    onSuccess: (summaries, name) => {
      toast(`Removed ${name}: ${describeApply(summaries)}`, "ok");
      setSelectedName(null);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const update = useMutation({
    mutationFn: ({ name, rev }: { name: string; rev: string }) => api.updateSkill(name, rev),
    onSuccess: (_e, { name }) => {
      toast(`Updated ${name}`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const rollback = useMutation({
    mutationFn: api.rollbackSkill,
    onSuccess: (_e, name) => {
      toast(`Rolled back ${name}`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const updateAll = useMutation({
    mutationFn: async () => {
      for (const u of updates.data ?? []) await api.updateSkill(u.name, u.latest);
      return updates.data?.length ?? 0;
    },
    onSuccess: (n) => {
      toast(`Updated ${n} skills`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const [diff, setDiff] = useState<{ name: string; text: string } | null>(null);

  if (library.isLoading) return <Centered><Spinner /></Centered>;

  if (!library.data?.length) {
    return (
      <EmptyState
        title="No skills yet"
        body="Your library is the one screen of truth for every skill on this machine. Install from Discover, paste a git URL, or let Doctor adopt the skills your agents already have."
        action={
          <div className="text-[12.5px] text-ink-soft">
            Tip: <span className="font-semibold">Doctor</span> will find skills installed by other
            tools (like <Mono>npx skills</Mono>) and import them without touching your agent dirs.
          </div>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-[1fr_minmax(340px,42%)] h-full">
      {/* table */}
      <div className="flex flex-col min-w-0 border-r border-line">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <Input
            placeholder="Search skills, sources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex rounded border border-line overflow-hidden text-[12px]">
            {(["all", "updates", "local"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cx(
                  "px-2.5 py-1 capitalize",
                  filter === f ? "bg-paper-sunken font-medium" : "text-ink-soft hover:bg-paper-sunken/60",
                )}
              >
                {f}
                {f === "updates" && updateMap.size > 0 && ` (${updateMap.size})`}
              </button>
            ))}
          </div>
          {updateMap.size > 0 && (
            <Button variant="primary" className="ml-auto" onClick={() => updateAll.mutate()} disabled={updateAll.isPending}>
              {updateAll.isPending ? <Spinner /> : `Update all (${updateMap.size})`}
            </Button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-paper z-10">
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-2 font-semibold">Skill</th>
                <th className="px-2 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 font-semibold">Rev</th>
                <th className="px-2 py-2 font-semibold">Profiles</th>
                <th className="px-2 py-2 font-semibold w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <LibraryRow
                  key={s.name}
                  skill={s}
                  latest={updateMap.get(s.name)}
                  selected={selectedName === s.name}
                  onSelect={() => setSelectedName(s.name)}
                  onUpdate={(rev) => update.mutate({ name: s.name, rev })}
                  onDiff={async (rev) => {
                    try {
                      const text = await api.diffSkill(s.name, rev);
                      setDiff({ name: s.name, text });
                    } catch (e) {
                      toast(String(e), "error");
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* inspector */}
      <div className="overflow-y-auto">
        {selectedName && detail.data ? (
          <div className="p-5 rise-in" key={selectedName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight">{detail.data.entry.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Mono>{detail.data.entry.source}</Mono>
                  <Sha sha={detail.data.entry.rev} />
                  <Badge tone={detail.data.entry.track === "latest" ? "warn" : "neutral"}>
                    {detail.data.entry.track}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {detail.data.entry.prev_rev && (
                  <Button onClick={() => rollback.mutate(selectedName)} disabled={rollback.isPending}>
                    Roll back
                  </Button>
                )}
                <Button variant="danger" onClick={() => remove.mutate(selectedName)} disabled={remove.isPending}>
                  Remove
                </Button>
              </div>
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <SkillMarkdown content={detail.data.skill_md} />
            </div>

            <div className="mt-5">
              <SectionLabel>Files</SectionLabel>
              {detail.data.files.map((f) => (
                <div key={f.path} className="flex items-center justify-between py-0.5">
                  <Mono className={f.executable ? "text-warn font-medium" : undefined}>
                    {f.path}
                    {f.executable && " ⚠"}
                  </Mono>
                  <span className="text-[11px] text-ink-faint">{formatSize(f.size)}</span>
                </div>
              ))}
              <div className="mt-2 text-[11px] text-ink-faint">
                Store: <Mono>{detail.data.store_path}</Mono>
              </div>
            </div>
          </div>
        ) : (
          <Centered>
            <span className="text-ink-faint text-[12.5px]">Select a skill to inspect it.</span>
          </Centered>
        )}
      </div>

      {/* diff viewer */}
      {diff && (
        <div className="fixed inset-0 z-40 bg-ink/20 flex items-center justify-center" onClick={() => setDiff(null)}>
          <div
            className="rise-in bg-paper-raised border border-line-strong rounded-lg w-[760px] max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
              <span className="font-semibold text-[13px]">Pending update — {diff.name}</span>
              <Button variant="ghost" onClick={() => setDiff(null)}>Close</Button>
            </div>
            <pre className="overflow-auto p-4 text-[11.5px] font-mono leading-5 select-text" style={{ userSelect: "text" }}>
              {diff.text || "(no changes inside the skill directory)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function LibraryRow({
  skill,
  latest,
  selected,
  onSelect,
  onUpdate,
  onDiff,
}: {
  skill: LibrarySkill;
  latest?: string;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (rev: string) => void;
  onDiff: (rev: string) => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={cx(
        "border-b border-line/60 cursor-default transition-colors",
        selected ? "bg-accent-wash/60" : "hover:bg-paper-sunken/70",
      )}
    >
      <td className="px-4 py-2">
        <div className="font-medium">{skill.name}</div>
        <div className="text-ink-faint text-[11.5px] line-clamp-1">{skill.description}</div>
      </td>
      <td className="px-2 py-2">
        <Mono>{skill.source === "local" ? "local" : skill.source.replace("github.com/", "")}</Mono>
      </td>
      <td className="px-2 py-2">
        <Sha sha={skill.rev} />
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1">
          {skill.profiles.map((p) => (
            <Badge key={p} tone="accent">{p}</Badge>
          ))}
        </div>
      </td>
      <td className="px-2 py-2 text-right">
        {latest && (
          <span className="inline-flex gap-1">
            <Button variant="ghost" onClick={(e) => { e.stopPropagation(); onDiff(latest); }}>
              diff
            </Button>
            <Button variant="primary" onClick={(e) => { e.stopPropagation(); onUpdate(latest); }}>
              Update
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex items-center justify-center">{children}</div>;
}
