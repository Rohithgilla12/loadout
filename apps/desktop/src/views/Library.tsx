import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeApply } from "../lib/api";
import type { LibrarySkill } from "../lib/types";
import { Badge, Button, EmptyState, Input, Mono, SectionLabel, Sha, Spinner, cx } from "../components/ui";
import { SkillMarkdown } from "../components/SkillMarkdown";
import { SkillEditor } from "../components/SkillEditor";
import { estimateSkillTokens, formatSize, formatTokens } from "../lib/format";
import { useToast } from "../components/Toast";

const USAGE_WINDOW_DAYS = 30;

export function Library() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "updates" | "local" | "unused">("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const library = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });
  const updates = useQuery({ queryKey: ["updates"], queryFn: api.checkUpdates, staleTime: 1000 * 60 * 60, retry: false });
  const usage = useQuery({ queryKey: ["usage"], queryFn: api.scanUsage, staleTime: 1000 * 60 * 10, retry: false });

  // invocation names can be plugin-namespaced ("superpowers:brainstorming");
  // match library names directly or by the part after the colon
  const usageMap = useMemo(() => {
    const map = new Map<string, { count: number; last_used?: string | null }>();
    for (const u of usage.data?.skills ?? []) {
      const existing = map.get(u.name);
      map.set(u.name, existing ? { count: existing.count + u.count, last_used: maxIso(existing.last_used, u.last_used) } : u);
      const short = u.name.includes(":") ? u.name.split(":").pop()! : null;
      if (short) {
        const e = map.get(short);
        map.set(short, e ? { count: e.count + u.count, last_used: maxIso(e.last_used, u.last_used) } : { count: u.count, last_used: u.last_used });
      }
    }
    return map;
  }, [usage.data]);

  const usedRecently = (name: string) => {
    const last = usageMap.get(name)?.last_used;
    if (!last) return false;
    return Date.now() - new Date(last).getTime() < USAGE_WINDOW_DAYS * 24 * 3600 * 1000;
  };

  const recentCount = useMemo(
    () => (library.data ?? []).filter((s) => usedRecently(s.name)).length,
    [library.data, usageMap],
  );

  const buildFromUsage = useMutation({
    mutationFn: async () => {
      const used = (library.data ?? []).filter((s) => usedRecently(s.name)).map((s) => s.name);
      if (!used.length) throw new Error("no recently-used skills to build from");
      const name = `active-${USAGE_WINDOW_DAYS}d`;
      const profile = await api.createProfile(name).catch(async () => {
        // exists — overwrite its contents
        const all = await api.listProfiles();
        const existing = all.find((p) => p.name === name);
        if (!existing) throw new Error("could not create profile");
        return existing;
      });
      await api.saveProfile({ ...profile, skills: used });
      return { name, count: used.length };
    },
    onSuccess: ({ name, count }) => {
      toast(`Profile “${name}” built from your last ${USAGE_WINDOW_DAYS} days — ${count} skills`, "ok");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e) => toast(String(e), "error"),
  });
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
    if (filter === "unused") list = list.filter((s) => !usedRecently(s.name));
    return list;
  }, [library.data, search, filter, updateMap, usageMap]);

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

  // Escape: close the diff first, then the inspector
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDiff((d) => {
        if (d) return null;
        setSelectedName(null);
        return d;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            {(["all", "updates", "local", "unused"] as const).map((f) => (
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

        {usage.data && library.data && library.data.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-line bg-paper-sunken/50 text-[12.5px]">
            <span>
              <b>{recentCount}</b> of <b>{library.data.length}</b> skills used in the last{" "}
              {USAGE_WINDOW_DAYS} days
              <span className="text-ink-faint">
                {" "}
                · from your Claude Code sessions, locally
              </span>
            </span>
            <Button
              className="ml-auto"
              onClick={() => buildFromUsage.mutate()}
              disabled={buildFromUsage.isPending || !recentCount}
              title="Create (or refresh) a profile containing only the skills you actually used"
            >
              {buildFromUsage.isPending ? <Spinner /> : "Build profile from usage"}
            </Button>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-paper z-10">
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-2 font-semibold">Skill</th>
                <th className="px-2 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 font-semibold">Rev</th>
                <th className="px-2 py-2 font-semibold text-right" title="Estimated tokens this skill adds to every agent session (name + description injection)">Tok</th>
                <th className="px-2 py-2 font-semibold text-right" title="Times this skill fired in your Claude Code sessions (all time, scanned locally)">Used</th>
                <th className="px-2 py-2 font-semibold">Profiles</th>
                <th className="px-2 py-2 font-semibold w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <LibraryRow
                  key={s.name}
                  skill={s}
                  usage={usageMap.get(s.name)}
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
          {!rows.length && (
            <div className="px-6 py-14 text-center text-[13px] text-ink-soft rise-in">
              {filter === "updates" ? (
                <>
                  <div className="font-semibold text-ink mb-1">Everything is up to date</div>
                  Every pinned skill matches its upstream HEAD. Updates are checked on launch — new
                  ones show up here with a diff and one-click apply.
                </>
              ) : filter === "local" ? (
                <>
                  <div className="font-semibold text-ink mb-1">No local skills yet</div>
                  Create one in Settings, fork a remote skill, or adopt from Doctor.
                </>
              ) : (
                <>Nothing matches “{search}”.</>
              )}
            </div>
          )}
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
                {detail.data.entry.source === "local" ? (
                  <Button
                    onClick={() => setEditing({ name: selectedName, content: detail.data!.skill_md })}
                    title="Edit SKILL.md with live preview and description linting"
                  >
                    Edit
                  </Button>
                ) : (
                  <Button
                    title="Remote skills are pinned content — forking makes a local editable copy"
                    onClick={async () => {
                      try {
                        const entry = await api.forkSkill(selectedName, `${selectedName}-fork`);
                        const content = await api.readSkillFile(entry.name, "SKILL.md");
                        queryClient.invalidateQueries();
                        setEditing({ name: entry.name, content });
                      } catch (e) {
                        toast(String(e), "error");
                      }
                    }}
                  >
                    Fork & edit
                  </Button>
                )}
                {detail.data.entry.prev_rev && (
                  <Button onClick={() => rollback.mutate(selectedName)} disabled={rollback.isPending}>
                    Roll back
                  </Button>
                )}
                <Button variant="danger" onClick={() => remove.mutate(selectedName)} disabled={remove.isPending}>
                  Remove
                </Button>
                <Button variant="ghost" onClick={() => setSelectedName(null)} title="Close (Esc)">
                  ✕
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

      {/* skill editor (F6) */}
      {editing && (
        <SkillEditor
          name={editing.name}
          initial={editing.content}
          onClose={() => setEditing(null)}
        />
      )}

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

function maxIso(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

function relativeDays(iso?: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function LibraryRow({
  skill,
  usage,
  latest,
  selected,
  onSelect,
  onUpdate,
  onDiff,
}: {
  skill: LibrarySkill;
  usage?: { count: number; last_used?: string | null };
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
      <td className="px-2 py-2 text-right">
        <Mono>{formatTokens(estimateSkillTokens(skill.name, skill.description))}</Mono>
      </td>
      <td className="px-2 py-2 text-right">
        <Mono
          className={usage ? undefined : "opacity-40"}
          title={usage ? `last used ${relativeDays(usage.last_used)}` : "never seen in your sessions"}
        >
          {usage ? `${usage.count}×` : "—"}
        </Mono>
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
