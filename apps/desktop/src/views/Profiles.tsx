import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeApply } from "../lib/api";
import type { Profile } from "../lib/types";
import { Badge, Button, EmptyState, Input, Mono, SectionLabel, Select, cx } from "../components/ui";
import { useToast } from "../components/Toast";

export function Profiles() {
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const toast = useToast();
  const queryClient = useQueryClient();

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.getOverview });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const create = useMutation({
    mutationFn: api.createProfile,
    onSuccess: (p) => {
      setNewName("");
      setSelected(p.name);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e) => toast(String(e), "error"),
  });

  const setBase = useMutation({
    mutationFn: api.setBaseProfile,
    onSuccess: (summaries, name) => {
      toast(
        name
          ? `Base profile is now ${name}: ${describeApply(summaries)}`
          : `Base profile cleared: ${describeApply(summaries)}`,
        "ok",
      );
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const baseProfile = overview.data?.settings.base_profile;
  const current = profiles.data?.find((p) => p.name === selected) ?? null;

  if (profiles.data && !profiles.data.length) {
    return (
      <EmptyState
        title="Profiles are the point"
        body="A profile is a named set of skills you can switch on per project — your TypeScript kit, your Go kit, your writing kit. Create one, fill it from your library, then assign it to projects or make it your always-on base."
        action={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) create.mutate(newName.trim());
            }}
          >
            <Input
              placeholder="e.g. typescript"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <Button variant="primary" type="submit">Create profile</Button>
          </form>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-[230px_1fr] h-full">
      {/* profile list */}
      <div className="border-r border-line flex flex-col">
        <form
          className="flex gap-1.5 p-3 border-b border-line"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate(newName.trim());
          }}
        >
          <Input placeholder="New profile…" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button variant="primary" type="submit" disabled={!newName.trim()}>+</Button>
        </form>
        <div className="overflow-y-auto">
          {profiles.data?.map((p) => {
            const usedBy = projects.data?.filter((proj) => proj.profile === p.name).length ?? 0;
            return (
              <button
                key={p.name}
                onClick={() => setSelected(p.name)}
                className={cx(
                  "w-full text-left px-3.5 py-2 border-b border-line/60 transition-colors",
                  selected === p.name ? "bg-accent-wash/60" : "hover:bg-paper-sunken",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-[13px]">{p.name}</span>
                  {baseProfile === p.name && <Badge tone="accent">base</Badge>}
                </div>
                <div className="text-[11px] text-ink-faint mt-0.5">
                  {p.skills.length} skill{p.skills.length === 1 ? "" : "s"}
                  {p.extends ? ` · extends ${p.extends}` : ""}
                  {usedBy ? ` · ${usedBy} project${usedBy === 1 ? "" : "s"}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* detail */}
      {current ? (
        <ProfileDetail
          key={current.name}
          profile={current}
          isBase={baseProfile === current.name}
          onSetBase={() => setBase.mutate(current.name)}
          onDeleted={() => setSelected(null)}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-ink-faint text-[12.5px]">
          Select a profile.
        </div>
      )}
    </div>
  );
}

function ProfileDetail({
  profile,
  isBase,
  onSetBase,
  onDeleted,
}: {
  profile: Profile;
  isBase: boolean;
  onSetBase: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const library = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const [filter, setFilter] = useState("");

  const save = useMutation({
    mutationFn: api.saveProfile,
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => toast(String(e), "error"),
  });

  const del = useMutation({
    mutationFn: api.deleteProfile,
    onSuccess: (summaries) => {
      toast(`Deleted ${profile.name}: ${describeApply(summaries)}`, "ok");
      onDeleted();
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const duplicate = useMutation({
    mutationFn: () => api.duplicateProfile(profile.name, `${profile.name}-copy`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
    onError: (e) => toast(String(e), "error"),
  });

  const inProfile = useMemo(() => new Set(profile.skills), [profile.skills]);
  const inherited = useMemo(() => {
    if (!profile.extends) return [];
    return profiles.data?.find((p) => p.name === profile.extends)?.skills ?? [];
  }, [profile.extends, profiles.data]);

  const available = useMemo(() => {
    const q = filter.toLowerCase().trim();
    return (library.data ?? [])
      .filter((s) => !inProfile.has(s.name))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [library.data, inProfile, filter]);

  const toggle = (name: string, add: boolean) => {
    const skills = add ? [...profile.skills, name] : profile.skills.filter((s) => s !== name);
    save.mutate({ ...profile, skills });
  };

  const extendCandidates = (profiles.data ?? []).filter(
    (p) => p.name !== profile.name && !p.extends,
  );

  return (
    <div className="flex flex-col h-full rise-in">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-tight">{profile.name}</h2>
            {isBase && <Badge tone="accent">base — applied globally</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[12px] text-ink-soft">
            <span>extends</span>
            <Select
              value={profile.extends ?? ""}
              onChange={(e) => save.mutate({ ...profile, extends: e.target.value || null })}
            >
              <option value="">nothing</option>
              {extendCandidates.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex gap-1.5">
          {!isBase && (
            <Button onClick={onSetBase} title="Apply this profile to global agent directories">
              Make base
            </Button>
          )}
          <Button onClick={() => duplicate.mutate()}>Duplicate</Button>
          <Button variant="danger" onClick={() => del.mutate(profile.name)}>Delete</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 flex-1 min-h-0">
        {/* in profile */}
        <div className="border-r border-line flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-2">
            <SectionLabel>
              In profile ({profile.skills.length}
              {inherited.length ? ` + ${inherited.length} inherited` : ""})
            </SectionLabel>
          </div>
          <div className="overflow-y-auto flex-1 px-2">
            {inherited.map((name) => (
              <div key={name} className="flex items-center justify-between px-2 py-1.5 text-[12.5px] text-ink-faint">
                <span>{name}</span>
                <Badge tone="neutral">from {profile.extends}</Badge>
              </div>
            ))}
            {profile.skills.map((name) => (
              <div
                key={name}
                className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-paper-sunken text-[12.5px]"
              >
                <span className="font-medium">{name}</span>
                <Button
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => toggle(name, false)}
                >
                  remove →
                </Button>
              </div>
            ))}
            {!profile.skills.length && !inherited.length && (
              <div className="px-2 py-4 text-[12px] text-ink-faint">
                Empty. Add skills from the right.
              </div>
            )}
          </div>
        </div>

        {/* library pool */}
        <div className="flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <SectionLabel>Library</SectionLabel>
            <Input
              placeholder="filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-[180px] ml-auto !py-0.5 text-[12px]"
            />
          </div>
          <div className="overflow-y-auto flex-1 px-2 pb-3">
            {available.map((s) => (
              <div
                key={s.name}
                className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-paper-sunken text-[12.5px]"
              >
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[11px] text-ink-faint truncate">{s.description}</div>
                </div>
                <Button
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => toggle(s.name, true)}
                >
                  ← add
                </Button>
              </div>
            ))}
            {!available.length && (
              <div className="px-2 py-4 text-[12px] text-ink-faint">
                {library.data?.length
                  ? "Everything is already in this profile."
                  : <>Library is empty — install skills from <Mono>Discover</Mono> first.</>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
