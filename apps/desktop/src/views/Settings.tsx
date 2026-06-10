import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { api } from "../lib/api";
import { setThemePref, useThemePref, type ThemePref } from "../lib/theme";
import { Badge, Button, Input, Mono, SectionLabel, Spinner, cx } from "../components/ui";
import { useToast } from "../components/Toast";

function ThemeToggle() {
  const pref = useThemePref();
  const options: Array<{ id: ThemePref; label: string }> = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];
  return (
    <div className="inline-flex rounded border border-line overflow-hidden text-[12.5px] mt-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setThemePref(o.id)}
          className={cx(
            "px-3 py-1",
            pref === o.id ? "bg-paper-sunken font-medium" : "text-ink-soft hover:bg-paper-sunken/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function UpdatesSection({ version }: { version: string }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checked, setChecked] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);

  const runCheck = async () => {
    setChecking(true);
    try {
      const u = await check();
      setUpdate(u);
      setChecked(true);
    } catch (e) {
      toast(`Update check failed: ${e}`, "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="mb-7">
      <SectionLabel>Updates</SectionLabel>
      <p className="text-[12.5px] text-ink-soft mb-2">
        You're on <Mono>{version ? `v${version}` : "…"}</Mono>. Loadout also checks once on
        launch; updates are signed and served from GitHub Releases — nothing installs without
        your say-so.
      </p>
      {update ? (
        <div className="max-w-md px-3 py-2.5 rounded-md border border-accent/40 bg-accent-wash/60 text-[12.5px]">
          <div className="font-semibold">Loadout {update.version} is available</div>
          {update.body && (
            <div className="text-ink-soft mt-0.5 whitespace-pre-wrap">{update.body}</div>
          )}
          <Button
            variant="primary"
            className="mt-2"
            disabled={installing}
            onClick={async () => {
              setInstalling(true);
              try {
                await update.downloadAndInstall();
                await relaunch();
              } catch (e) {
                setInstalling(false);
                toast(String(e), "error");
              }
            }}
          >
            {installing ? <Spinner /> : "Update & restart"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <Button onClick={runCheck} disabled={checking}>
            {checking ? <Spinner /> : "Check for updates"}
          </Button>
          {checked && !checking && (
            <span className="text-[12.5px] text-ink-faint">You're on the latest version.</span>
          )}
        </div>
      )}
    </section>
  );
}

function AdminKeyField({
  current,
  onSaved,
}: {
  current: import("../lib/types").Settings | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [key, setKey] = useState(current?.share_admin_key ?? "");
  return (
    <form
      className="flex gap-2 max-w-md"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!current) return;
        try {
          await api.saveSettings({ ...current, share_admin_key: key.trim() || null });
          toast(key.trim() ? "Admin key saved" : "Admin key cleared", "ok");
          onSaved();
        } catch (err) {
          toast(String(err), "error");
        }
      }}
    >
      <Input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="lk_…"
        spellCheck={false}
      />
      <Button type="submit">Save</Button>
    </form>
  );
}

export function SettingsView() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.getOverview });

  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

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
        <SectionLabel>Appearance</SectionLabel>
        <ThemeToggle />
      </section>

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
        <SectionLabel>Sharing</SectionLabel>
        <p className="text-[12px] text-ink-faint mb-2">
          Admin key for loadout.gilla.fun — unlocks reserved short-link slugs (typescript, go,
          dev…). Leave empty unless you have one.
        </p>
        <AdminKeyField current={o?.settings ?? null} onSaved={() => queryClient.invalidateQueries({ queryKey: ["overview"] })} />
      </section>

      <section className="mb-7">
        <SectionLabel>Storage</SectionLabel>
        <div className="text-[12.5px] text-ink-soft">
          All state lives in <Mono>{o?.loadout_root}</Mono> — the store (immutable skill content),
          profiles, lockfile, and project registry. Agent directories only ever contain symlinks
          into the store.
        </div>
      </section>

      <UpdatesSection version={appVersion} />

      <section>
        <SectionLabel>About</SectionLabel>
        <div className="text-[12.5px] text-ink-soft">
          Loadout{appVersion ? ` v${appVersion}` : ""} — open source, MIT.{" "}
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
