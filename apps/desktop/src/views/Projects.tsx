import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { api, describeApply } from "../lib/api";
import type { LoadoutFile, ProjectView } from "../lib/types";
import { Badge, Button, EmptyState, Mono, SectionLabel, Select, Sha, Spinner, cx } from "../components/ui";
import { useToast } from "../components/Toast";

export function Projects() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const register = useMutation({
    mutationFn: api.registerProject,
    onSuccess: (p) => {
      toast(`Registered ${p.name}`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const pick = async () => {
    const dir = await open({ directory: true, multiple: false, title: "Register a project" });
    if (typeof dir === "string") register.mutate(dir);
  };

  if (projects.data && !projects.data.length) {
    return (
      <EmptyState
        title="Register your projects"
        body="A project gets its own skill set: your base profile plus whatever profile you assign here. Loadout writes symlinks into the project's agent directories — switching is instant and offline."
        action={<Button variant="primary" onClick={pick}>Choose a directory…</Button>}
      />
    );
  }

  return (
    <div className="p-5 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-semibold tracking-tight">Projects</h2>
        <Button variant="primary" onClick={pick}>Register project…</Button>
      </div>
      <div className="flex flex-col gap-3">
        {projects.data?.map((p) => (
          <ProjectCard key={p.path} project={p} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectView }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const [loadoutFile, setLoadoutFile] = useState<LoadoutFile | null>(null);

  const assign = useMutation({
    mutationFn: (profile: string | null) => api.assignProfile(project.path, profile),
    onSuccess: (s) => {
      toast(`${project.name}: ${describeApply(s)}`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const reapply = useMutation({
    mutationFn: () => api.applyProject(project.path),
    onSuccess: (s) => toast(`${project.name}: ${describeApply(s)}`, "ok"),
    onError: (e) => toast(String(e), "error"),
  });

  const unregister = useMutation({
    mutationFn: () => api.unregisterProject(project.path),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const exportFile = useMutation({
    mutationFn: () => api.exportLoadoutFile(project.profile!, project.path),
    onSuccess: (path) => toast(`Exported ${path} — commit it so your team gets this loadout`, "ok"),
    onError: (e) => toast(String(e), "error"),
  });

  const applyDeclared = useMutation({
    mutationFn: () => api.applyLoadoutFile(project.path),
    onSuccess: (s) => {
      toast(`Applied declared loadout: ${describeApply(s)}`, "ok");
      setLoadoutFile(null);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  return (
    <div className={cx("border border-line rounded-lg bg-paper-raised", !project.exists && "opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line/70">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[14px]">{project.name}</span>
            {!project.exists && <Badge tone="danger">directory missing</Badge>}
            {project.agents.map((a) => (
              <Badge key={a.id} tone="neutral">{a.display_name}</Badge>
            ))}
          </div>
          <Mono className="block truncate mt-0.5">{project.path}</Mono>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Select
            value={project.profile ?? ""}
            onChange={(e) => assign.mutate(e.target.value || null)}
            disabled={assign.isPending}
          >
            <option value="">no profile</option>
            {profiles.data?.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </Select>
          <Button onClick={() => reapply.mutate()} disabled={reapply.isPending}>
            {reapply.isPending ? <Spinner /> : "Re-apply"}
          </Button>
          {project.profile && (
            <Button onClick={() => exportFile.mutate()} title="Write loadout.json for committing">
              Export
            </Button>
          )}
          <Button variant="ghost" onClick={() => unregister.mutate()}>✕</Button>
        </div>
      </div>

      {/* loadout.json declaration banner (F3) */}
      {project.has_loadout_json && (
        <div className="px-4 py-2 bg-accent-wash/50 border-b border-line/70 flex items-center justify-between text-[12.5px]">
          <span>
            This repo declares a loadout in <Mono>loadout.json</Mono>.
          </span>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                setLoadoutFile(await api.readLoadoutFile(project.path));
              } catch (e) {
                toast(String(e), "error");
              }
            }}
          >
            Review & apply
          </Button>
        </div>
      )}

      {loadoutFile && (
        <div className="px-4 py-3 border-b border-line/70 rise-in">
          <SectionLabel>
            Declared profile “{loadoutFile.profile}” — {loadoutFile.skills.length} skills
          </SectionLabel>
          <div className="flex flex-col gap-1 mb-3">
            {loadoutFile.skills.map((s) => (
              <div key={s.skill} className="flex items-center gap-2 text-[12.5px]">
                <span className="font-medium">{s.skill}</span>
                <Mono>{s.source}</Mono>
                {s.rev && <Sha sha={s.rev} />}
                {s.vendored && <Badge tone="neutral">vendored</Badge>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => applyDeclared.mutate()}
              disabled={applyDeclared.isPending}
            >
              {applyDeclared.isPending ? <Spinner /> : "Install & apply this loadout"}
            </Button>
            <Button variant="ghost" onClick={() => setLoadoutFile(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* effective skill set */}
      {project.effective.length > 0 && (
        <div className="px-4 py-2.5 flex flex-wrap gap-1.5 items-center">
          {project.effective.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1">
              <Badge tone={s.installed ? (s.origin === "project" ? "accent" : "neutral") : "danger"}>
                {s.name}
                <span className="opacity-60">· {s.origin}</span>
                {!s.installed && " · not installed"}
              </Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
