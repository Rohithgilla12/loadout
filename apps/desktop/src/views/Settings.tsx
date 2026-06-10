import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge, Button, Input, Mono, SectionLabel, Spinner } from "../components/ui";
import { useToast } from "../components/Toast";

export function SettingsView() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.getOverview });

  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");

  const createLocal = useMutation({
    mutationFn: () => api.createLocalSkill(newSkillName.trim(), newSkillDesc.trim()),
    onSuccess: (entry) => {
      toast(`Created local skill ${entry.name} — find it in the Library`, "ok");
      setNewSkillName("");
      setNewSkillDesc("");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  if (overview.isLoading) {
    return <div className="h-full flex items-center justify-center"><Spinner /></div>;
  }

  const o = overview.data;

  return (
    <div className="p-5 max-w-2xl">
      <h2 className="text-[16px] font-semibold tracking-tight mb-5">Settings</h2>

      <section className="mb-7">
        <SectionLabel>Detected agents</SectionLabel>
        <div className="flex flex-col gap-1.5 mt-1">
          {o?.agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
              <Badge tone="ok">{a.display_name}</Badge>
              <Mono>~/{a.global_skills_dir}</Mono>
            </div>
          ))}
          {!o?.agents.length && (
            <div className="text-[12.5px] text-ink-faint">
              No supported agents detected on this machine.
            </div>
          )}
        </div>
      </section>

      <section className="mb-7">
        <SectionLabel>New local skill</SectionLabel>
        <p className="text-[12px] text-ink-faint mb-2">
          Scaffolds a spec-compliant SKILL.md in the store. The description is the trigger — write
          it as “Use when…” so agents know when to reach for it.
        </p>
        <form
          className="flex flex-col gap-2 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (newSkillName.trim()) createLocal.mutate();
          }}
        >
          <Input
            placeholder="skill-name (kebab-case)"
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
          />
          <Input
            placeholder="Use when working on…"
            value={newSkillDesc}
            onChange={(e) => setNewSkillDesc(e.target.value)}
          />
          <Button variant="primary" type="submit" disabled={!newSkillName.trim() || createLocal.isPending}>
            Create skill
          </Button>
        </form>
      </section>

      <section className="mb-7">
        <SectionLabel>Storage</SectionLabel>
        <div className="text-[12.5px] text-ink-soft">
          All state lives in <Mono>{o?.loadout_root}</Mono> — the store (immutable skill content),
          profiles, lockfile, and project registry. Agent directories only ever contain symlinks
          into the store.
        </div>
      </section>

      <section>
        <SectionLabel>About</SectionLabel>
        <div className="text-[12.5px] text-ink-soft">
          Loadout v0.1.0 — open source, MIT.{" "}
          <a
            className="text-accent-deep underline"
            href="https://github.com/Rohithgilla12/loadout"
            target="_blank"
            rel="noreferrer"
          >
            github.com/Rohithgilla12/loadout
          </a>
        </div>
      </section>
    </div>
  );
}
