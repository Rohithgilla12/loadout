import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeApply } from "../lib/api";
import type { Tab } from "../App";
import { cx } from "./ui";
import { useToast } from "./Toast";

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void | Promise<void>;
}

export function CommandPalette({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const library = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });

  useEffect(() => inputRef.current?.focus(), []);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = (
      [
        ["library", "Library"],
        ["profiles", "Profiles"],
        ["projects", "Projects"],
        ["discover", "Discover"],
        ["doctor", "Doctor"],
        ["settings", "Settings"],
      ] as Array<[Tab, string]>
    ).map(([tab, label]) => ({
      id: `nav-${tab}`,
      label: `Go to ${label}`,
      run: () => onNavigate(tab),
    }));

    const baseSwitch: Command[] = (profiles.data ?? []).map((p) => ({
      id: `base-${p.name}`,
      label: `Set base profile → ${p.name}`,
      hint: "global",
      run: async () => {
        const s = await api.setBaseProfile(p.name);
        toast(`Base profile is now ${p.name}: ${describeApply(s)}`, "ok");
        queryClient.invalidateQueries();
      },
    }));

    const assign: Command[] = (projects.data ?? []).flatMap((proj) =>
      (profiles.data ?? []).map((p) => ({
        id: `assign-${proj.path}-${p.name}`,
        label: `Assign ${p.name} → ${proj.name}`,
        hint: "project",
        run: async () => {
          const s = await api.assignProfile(proj.path, p.name);
          toast(`${proj.name} now uses ${p.name}: ${describeApply(s)}`, "ok");
          queryClient.invalidateQueries();
        },
      })),
    );

    const skills: Command[] = (library.data ?? []).map((s) => ({
      id: `skill-${s.name}`,
      label: s.name,
      hint: s.source,
      run: () => onNavigate("library"),
    }));

    return [...nav, ...baseSwitch, ...assign, ...skills];
  }, [profiles.data, projects.data, library.data, onNavigate, queryClient, toast]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands.slice(0, 12);
    return commands
      .filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q))
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, filtered.length - 1));
    if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
    if (e.key === "Enter" && filtered[index]) {
      filtered[index].run();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-ink/20 flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      <div
        className="rise-in w-[480px] bg-paper-raised border border-line-strong rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Switch profile, assign project, find skill…"
          className="w-full px-4 py-3 text-[14px] outline-none bg-transparent border-b border-line placeholder:text-ink-faint"
          style={{ userSelect: "text", cursor: "text" }}
        />
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={cx(
                "w-full flex items-center justify-between px-4 py-1.5 text-left text-[13px]",
                i === index ? "bg-accent-wash" : "hover:bg-paper-sunken",
              )}
              onMouseEnter={() => setIndex(i)}
              onClick={() => {
                c.run();
                onClose();
              }}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-[11px] text-ink-faint font-mono">{c.hint}</span>}
            </button>
          ))}
          {!filtered.length && (
            <div className="px-4 py-3 text-[12.5px] text-ink-faint">Nothing matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
