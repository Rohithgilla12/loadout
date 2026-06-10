import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import { ToastProvider } from "./components/Toast";
import { CommandPalette } from "./components/CommandPalette";
import { UpdateBanner } from "./components/UpdateBanner";
import { cx } from "./components/ui";
import { Library } from "./views/Library";
import { Profiles } from "./views/Profiles";
import { Projects } from "./views/Projects";
import { Discover } from "./views/Discover";
import { Doctor } from "./views/Doctor";
import { SettingsView } from "./views/Settings";

export type Tab = "library" | "profiles" | "projects" | "discover" | "doctor" | "settings";

const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: "library", label: "Library", key: "1" },
  { id: "profiles", label: "Profiles", key: "2" },
  { id: "projects", label: "Projects", key: "3" },
  { id: "discover", label: "Discover", key: "4" },
  { id: "doctor", label: "Doctor", key: "5" },
  { id: "settings", label: "Settings", key: "6" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("library");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.getOverview });
  const updates = useQuery({
    queryKey: ["updates"],
    queryFn: api.checkUpdates,
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        setTab(TABS[Number(e.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastProvider>
      <div className="h-full grid grid-cols-[190px_1fr]">
        {/* left rail */}
        <nav className="bg-paper-sunken border-r border-line flex flex-col">
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-baseline gap-1.5">
              <span className="w-2.5 h-2.5 bg-accent rounded-[3px] translate-y-px" />
              <h1 className="font-bold tracking-tight text-[15px]">Loadout</h1>
            </div>
            <div className="text-[10.5px] text-ink-faint mt-0.5 pl-4">skill manager</div>
          </div>
          <div className="flex flex-col gap-px px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  "flex items-center justify-between px-2.5 py-1.5 rounded text-left text-[13px] transition-colors duration-100",
                  tab === t.id
                    ? "bg-paper-raised font-semibold shadow-[inset_2px_0_0] shadow-accent"
                    : "text-ink-soft hover:text-ink hover:bg-paper-raised/60",
                )}
              >
                <span>{t.label}</span>
                <span className="flex items-center gap-1">
                  {t.id === "library" && (updates.data?.length ?? 0) > 0 && (
                    <span className="bg-accent text-paper-raised text-[10px] font-semibold rounded-full px-1.5 leading-4">
                      {updates.data!.length}
                    </span>
                  )}
                  <kbd className="text-[10px] text-ink-faint font-mono">⌘{t.key}</kbd>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-auto">
            <UpdateBanner />
          </div>
          <div className="px-4 py-3 border-t border-line text-[11px] text-ink-faint">
            {overview.data && (
              <>
                <div>
                  {overview.data.skill_count} skills · {overview.data.profile_count} profiles
                </div>
                <div className="mt-0.5">
                  {overview.data.agents.length} agent{overview.data.agents.length === 1 ? "" : "s"} detected
                </div>
              </>
            )}
            <button
              className="mt-1.5 text-ink-faint hover:text-ink"
              onClick={() => setPaletteOpen(true)}
            >
              ⌘K command palette
            </button>
          </div>
        </nav>

        {/* main */}
        <main className="overflow-y-auto">
          {tab === "library" && <Library />}
          {tab === "profiles" && <Profiles />}
          {tab === "projects" && <Projects />}
          {tab === "discover" && <Discover />}
          {tab === "doctor" && <Doctor />}
          {tab === "settings" && <SettingsView />}
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={setTab} />}
    </ToastProvider>
  );
}
