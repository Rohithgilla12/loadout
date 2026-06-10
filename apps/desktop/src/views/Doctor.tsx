import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { Badge, Button, Input, Mono, SectionLabel, Spinner, cx } from "../components/ui";
import { useToast } from "../components/Toast";

interface MigrateProgress {
  stage: "backup" | "scan" | "import" | "apply" | "done";
  done: number;
  total: number;
  detail: string;
}

const STAGE_LABELS: Record<MigrateProgress["stage"], string> = {
  backup: "Backing up agent directories",
  scan: "Scanning agent directories",
  import: "Importing skills",
  apply: "Re-applying symlinks",
  done: "Done",
};

export function Doctor() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const report = useQuery({ queryKey: ["doctor"], queryFn: api.doctor });
  const [replaceOriginals, setReplaceOriginals] = useState(true);
  const [backupFirst, setBackupFirst] = useState(true);
  const [importProfile, setImportProfile] = useState("everything");
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [progress, setProgress] = useState<MigrateProgress | null>(null);

  useEffect(() => {
    const unlisten = listen<MigrateProgress>("migrate-progress", (e) => setProgress(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const migrate = useMutation({
    mutationFn: () =>
      api.migrateAll(replaceOriginals, importProfile.trim() || "everything", backupFirst),
    onSuccess: (s) => {
      setProgress(null);
      setLastBackup(s.backup_path ?? null);
      toast(
        `Imported ${s.adopted} skills into “${s.profile}”${s.replaced ? `, took over ${s.replaced} originals` : ""}${s.skipped.length ? ` (${s.skipped.length} skipped)` : ""}${s.backup_path ? " — backup saved" : ""}`,
        "ok",
      );
      queryClient.invalidateQueries();
    },
    onError: (e) => {
      setProgress(null);
      toast(String(e), "error");
    },
  });

  const adopt = useMutation({
    mutationFn: api.adoptSkill,
    onSuccess: (entry) => {
      toast(`Adopted ${entry.name} into the store`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  const reapply = useMutation({
    mutationFn: api.reapplyAll,
    onSuccess: () => {
      toast("Re-applied every scope", "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  if (report.isLoading) {
    return <div className="h-full flex items-center justify-center"><Spinner /></div>;
  }

  const r = report.data;
  if (!r) return null;

  const healthy = !r.foreign.length && !r.missing_projects.length && !r.broken_store.length;

  return (
    <div className="p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[16px] font-semibold tracking-tight">Doctor</h2>
        <div className="flex gap-2">
          <Button onClick={() => report.refetch()}>Re-scan</Button>
          <Button onClick={() => reapply.mutate()} disabled={reapply.isPending}>
            {reapply.isPending ? <Spinner /> : "Re-apply all scopes"}
          </Button>
        </div>
      </div>
      <p className="text-[12.5px] text-ink-soft mb-5">
        Drift detection and repair. Loadout never deletes anything it didn't create.
      </p>

      {r.recovered_journal && (
        <div className="mb-4 px-3 py-2 rounded-md bg-warn-wash border border-warn/30 text-[12.5px]">
          A previous apply was interrupted — state was recovered and re-applied on launch.
        </div>
      )}

      {healthy && (
        <div className="px-3 py-2 rounded-md bg-ok-wash border border-ok/25 text-[12.5px]">
          Everything checks out. Agent directories match the lockfile, no foreign drift.
        </div>
      )}

      {r.foreign.length > 0 && (
        <section className="mb-6">
          {/* one-shot onboarding migration */}
          <div className="mb-5 border-2 border-accent rounded-lg p-4 bg-accent-wash/40 rise-in">
            <h3 className="font-semibold text-[14px]">Bring everything into Loadout</h3>
            <p className="text-[12.5px] text-ink-soft mt-1 leading-relaxed max-w-xl">
              One click imports all {r.foreign.length} entries — deduped down to unique skills
              (symlink aliases collapse to one) — into the store, collects them in a profile, and
              sets it as your base so nothing disappears from your agents.
            </p>
            <label className="flex items-center gap-2 mt-3 text-[12.5px]">
              <input
                type="checkbox"
                checked={backupFirst}
                onChange={(e) => setBackupFirst(e.target.checked)}
                className="accent-(--color-accent)"
              />
              <span>
                Back up agent skill directories first{" "}
                <span className="text-ink-faint">
                  (tar.gz of every agent dir, saved under ~/.loadout/backups, before anything moves)
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 mt-1.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={replaceOriginals}
                onChange={(e) => setReplaceOriginals(e.target.checked)}
                className="accent-(--color-accent)"
              />
              <span>
                Replace originals with managed symlinks{" "}
                <span className="text-ink-faint">
                  (only when content matches the imported copy, byte-for-byte)
                </span>
              </span>
            </label>
            {lastBackup && (
              <div className="mt-2 text-[12px] text-ink-soft">
                Backup saved: <Mono>{lastBackup}</Mono>
              </div>
            )}

            {/* live progress while the transfer runs */}
            {migrate.isPending && (
              <div className="mt-3 rise-in">
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="font-medium">
                    {STAGE_LABELS[progress?.stage ?? "scan"]}
                    {progress?.stage === "import" && progress.total > 0 && (
                      <span className="text-ink-faint font-normal">
                        {" "}— {progress.done} of {progress.total}
                      </span>
                    )}
                  </span>
                  {progress?.stage === "import" && progress.detail && (
                    <Mono className="truncate max-w-[260px]">{progress.detail}</Mono>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-paper-sunken border border-line overflow-hidden">
                  <div
                    className={cx(
                      "h-full bg-accent rounded-full transition-[width] duration-200 ease-out",
                      (!progress || progress.total === 0) && "animate-pulse",
                    )}
                    style={{
                      width:
                        progress?.stage === "import" && progress.total > 0
                          ? `${Math.round((progress.done / progress.total) * 100)}%`
                          : progress?.stage === "apply"
                            ? "96%"
                            : "12%",
                    }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[12.5px] text-ink-soft">Profile name</span>
              <Input
                value={importProfile}
                onChange={(e) => setImportProfile(e.target.value)}
                className="max-w-[180px]"
              />
              <Button
                variant="primary"
                onClick={() => migrate.mutate()}
                disabled={migrate.isPending}
              >
                {migrate.isPending ? <Spinner /> : "Import all"}
              </Button>
            </div>
          </div>

          <SectionLabel>Foreign skills ({r.foreign.length})</SectionLabel>
          <p className="text-[12px] text-ink-faint mb-2">
            Installed by other tools (e.g. <Mono>npx skills</Mono>). Adopt to manage them with
            profiles — the original files are copied, never moved.
          </p>
          <div className="border border-line rounded-lg overflow-hidden">
            {r.foreign.map((f) => (
              <div
                key={f.dir}
                className="flex items-center justify-between px-3.5 py-2 border-b border-line/60 last:border-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px]">{f.name}</span>
                    <Badge tone="neutral">{f.agent_id}</Badge>
                    <Badge tone="neutral">{f.scope === "global" ? "global" : "project"}</Badge>
                    {f.is_symlink && <Badge tone="warn">symlink</Badge>}
                    {f.already_adopted && <Badge tone="ok">in library</Badge>}
                  </div>
                  <Mono className="block truncate mt-0.5">{f.dir}</Mono>
                </div>
                <Button
                  className="shrink-0 ml-3"
                  onClick={() => adopt.mutate(f.dir)}
                  disabled={adopt.isPending || f.already_adopted}
                >
                  {f.already_adopted ? "Adopted" : "Adopt"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.broken_store.length > 0 && (
        <section className="mb-6">
          <SectionLabel>Broken store entries ({r.broken_store.length})</SectionLabel>
          <p className="text-[12px] text-ink-faint mb-2">
            These lockfile entries point at missing store content. Re-install or remove them from
            the Library.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {r.broken_store.map((name) => (
              <Badge key={name} tone="danger">{name}</Badge>
            ))}
          </div>
        </section>
      )}

      {r.missing_projects.length > 0 && (
        <section className="mb-6">
          <SectionLabel>Missing projects ({r.missing_projects.length})</SectionLabel>
          <p className="text-[12px] text-ink-faint mb-2">
            Registered directories that no longer exist (moved or deleted). Unregister them in
            Projects.
          </p>
          {r.missing_projects.map((p) => (
            <Mono key={p} className="block">{p}</Mono>
          ))}
        </section>
      )}
    </div>
  );
}
