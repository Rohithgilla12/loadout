import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DiscoveredSkill, ResolvedSource } from "../lib/types";
import { Badge, Button, Input, Mono, SectionLabel, Select, Sha, Spinner, cx } from "./ui";
import { SkillMarkdown } from "./SkillMarkdown";
import { useToast } from "./Toast";

/**
 * F5 + F7: paste a source → discover skills → trust review → install into a profile.
 * Used standalone on Discover and prefilled from registry rows.
 */
export function InstallFlow({
  initialInput,
  onDone,
}: {
  initialInput?: string;
  onDone?: () => void;
}) {
  const [input, setInput] = useState(initialInput ?? "");
  const [resolved, setResolved] = useState<ResolvedSource | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState<DiscoveredSkill | null>(null);
  const [targetProfile, setTargetProfile] = useState<string>("");
  const toast = useToast();
  const queryClient = useQueryClient();

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });

  const resolve = useMutation({
    mutationFn: api.resolveSource,
    onSuccess: (r) => {
      setResolved(r);
      setSelected(new Set(r.skills.length === 1 ? [r.skills[0].name] : []));
      setPreviewing(r.skills[0] ?? null);
      if (!r.skills.length) toast("No SKILL.md found in that source", "error");
    },
    onError: (e) => toast(String(e), "error"),
  });

  const install = useMutation({
    mutationFn: () =>
      api.installSkills(
        resolved!.source === "local" ? resolved!.url : resolved!.source,
        [...selected],
        resolved!.rev || null,
        targetProfile || null,
      ),
    onSuccess: (entries) => {
      toast(
        `Installed ${entries.length} skill${entries.length === 1 ? "" : "s"}${targetProfile ? ` into ${targetProfile}` : ""}`,
        "ok",
      );
      queryClient.invalidateQueries();
      setResolved(null);
      setInput("");
      onDone?.();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const executables = useMemo(
    () => previewing?.files.filter((f) => f.executable) ?? [],
    [previewing],
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) resolve.mutate(input.trim());
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="owner/repo · git URL · deep link · local path"
          spellCheck={false}
        />
        <Button variant="primary" type="submit" disabled={resolve.isPending || !input.trim()}>
          {resolve.isPending ? <Spinner /> : "Fetch"}
        </Button>
      </form>

      {resolved && resolved.skills.length > 0 && (
        <div className="rise-in border border-line rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-paper-sunken border-b border-line">
            <div className="flex items-center gap-2">
              <Mono>{resolved.source === "local" ? resolved.url : resolved.source}</Mono>
              {resolved.rev && <Sha sha={resolved.rev} />}
              <Badge tone="neutral">
                {resolved.skills.length} skill{resolved.skills.length === 1 ? "" : "s"} found
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-[260px_1fr] min-h-[320px] max-h-[460px]">
            {/* picker */}
            <div className="border-r border-line overflow-y-auto">
              {resolved.skills.map((s) => (
                <button
                  key={s.repo_path}
                  className={cx(
                    "w-full text-left px-3 py-2 border-b border-line/60 hover:bg-paper-sunken transition-colors",
                    previewing?.repo_path === s.repo_path && "bg-accent-wash/60",
                  )}
                  onClick={() => setPreviewing(s)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.name)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        e.target.checked ? next.add(s.name) : next.delete(s.name);
                        setSelected(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-(--color-accent)"
                    />
                    <span className="font-medium text-[12.5px] truncate">{s.name}</span>
                    {s.files.some((f) => f.executable) && <Badge tone="warn">scripts</Badge>}
                  </div>
                  <div className="text-[11.5px] text-ink-faint line-clamp-2 mt-0.5 pl-5">
                    {s.description || "no description"}
                  </div>
                </button>
              ))}
            </div>

            {/* trust panel: rendered SKILL.md + file listing with executables flagged */}
            <div className="overflow-y-auto p-4">
              {previewing ? (
                <>
                  {executables.length > 0 && (
                    <div className="mb-3 px-3 py-2 rounded-md bg-warn-wash border border-warn/30 text-[12px]">
                      <span className="font-semibold">
                        Contains {executables.length} runnable file{executables.length === 1 ? "" : "s"}.
                      </span>{" "}
                      Loadout never executes them, but your agent might. Review before installing:
                      <div className="mt-1 flex flex-wrap gap-1">
                        {executables.map((f) => (
                          <Mono key={f.path} className="text-warn">
                            {f.path}
                          </Mono>
                        ))}
                      </div>
                    </div>
                  )}
                  <SkillMarkdown content={previewing.skill_md} />
                  <div className="mt-4">
                    <SectionLabel>Files ({previewing.files.length})</SectionLabel>
                    <div className="flex flex-col">
                      {previewing.files.map((f) => (
                        <div key={f.path} className="flex items-center justify-between py-0.5">
                          <Mono className={f.executable ? "text-warn font-medium" : undefined}>
                            {f.path}
                            {f.executable && " ⚠"}
                          </Mono>
                          <span className="text-[11px] text-ink-faint">{formatSize(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-ink-faint text-[12.5px]">Select a skill to review it.</div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 bg-paper-sunken border-t border-line">
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="text-ink-soft">Add to profile</span>
              <Select value={targetProfile} onChange={(e) => setTargetProfile(e.target.value)}>
                <option value="">(none — library only)</option>
                {profiles.data?.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="primary"
              disabled={!selected.size || install.isPending}
              onClick={() => install.mutate()}
            >
              {install.isPending ? <Spinner /> : `Install ${selected.size} skill${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
