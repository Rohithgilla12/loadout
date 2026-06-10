import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, describeApply } from "../lib/api";
import type { SlugCheck } from "../lib/types";
import type { Profile } from "../lib/types";
import { Badge, Button, EmptyState, Input, Mono, SectionLabel, Select, Spinner, cx } from "../components/ui";
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

  const skippedNote = (skipped: string[]) =>
    skipped.length
      ? ` (${skipped.length} local skill${skipped.length === 1 ? "" : "s"} can't travel in a link)`
      : "";

  const [shareOpen, setShareOpen] = useState(false);

  const copyJson = useMutation({
    mutationFn: () => api.profileShare(profile.name),
    onSuccess: async (s) => {
      await navigator.clipboard.writeText(s.json);
      toast(`loadout.json copied${skippedNote(s.skipped_local)}`, "ok");
    },
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
      {shareOpen && <ShareDialog profile={profile.name} onClose={() => setShareOpen(false)} />}
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
          <Button onClick={() => setShareOpen(true)} title="Create a short share link on loadout.gilla.fun">
            Share…
          </Button>
          <Button onClick={() => copyJson.mutate()} title="Copy loadout.json for committing to a repo">
            Copy loadout.json
          </Button>
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

function ShareDialog({ profile, onClose }: { profile: string; onClose: () => void }) {
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [check, setCheck] = useState<SlugCheck | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // live availability, debounced
  useEffect(() => {
    setCheck(null);
    const wanted = slug.trim().toLowerCase();
    if (wanted.length < 3) return;
    const handle = setTimeout(() => {
      api.checkSlug(wanted).then(setCheck).catch(() => {});
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = useMutation({
    mutationFn: () => api.shareShorten(profile, slug.trim() ? slug.trim().toLowerCase() : null),
    onSuccess: async (link) => {
      setUrl(link);
      await navigator.clipboard.writeText(link).catch(() => {});
      toast("Short link created and copied", "ok");
    },
    onError: (e) => toast(String(e), "error"),
  });

  const wanted = slug.trim().toLowerCase();
  const blocked = wanted.length > 0 && check !== null && !check.available;

  return (
    <div className="fixed inset-0 z-40 bg-ink/20 flex items-start justify-center pt-[22vh]" onClick={onClose}>
      <div
        className="rise-in w-[460px] bg-paper-raised border border-line-strong rounded-lg shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold text-[14px] mb-1">Share “{profile}”</div>
        <p className="text-[12px] text-ink-soft mb-3">
          Creates a short link on loadout.gilla.fun. Leave the slug empty for a random one.
        </p>

        {url ? (
          <div className="flex flex-col gap-2">
            <Input readOnly value={url} onFocus={(e) => e.target.select()} />
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </Button>
              <Button onClick={() => openUrl(url)}>Open</Button>
              <Button variant="ghost" onClick={onClose} className="ml-auto">Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <Mono className="shrink-0">loadout.gilla.fun/s/</Mono>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="custom-slug (optional)"
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="h-5 mt-1 text-[12px]">
              {wanted.length >= 3 && check && (
                <span className={check.available ? "text-ok" : "text-warn"}>
                  {check.available
                    ? `✓ /s/${wanted} is available`
                    : !check.valid
                      ? "✕ 3–32 chars: a–z, 0–9, hyphens inside"
                      : check.reserved
                        ? "🔒 reserved slug — set your admin key in Settings to claim it"
                        : "✕ taken"}
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                variant="primary"
                disabled={create.isPending || blocked}
                onClick={() => create.mutate()}
              >
                {create.isPending ? <Spinner /> : "Create short link"}
              </Button>
              <Button variant="ghost" onClick={onClose} className="ml-auto">Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
