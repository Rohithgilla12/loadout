import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge, Button, Mono, SectionLabel, Spinner, cx } from "./ui";
import { SkillMarkdown } from "./SkillMarkdown";
import { useToast } from "./Toast";

interface Lint {
  level: "error" | "warn" | "ok";
  message: string;
}

/// The description IS the trigger: agents decide whether to load a skill
/// from name + description alone. Lint for the phrasing that actually works.
export function lintSkill(content: string, skillName: string): Lint[] {
  const lints: Lint[] = [];
  let name = "";
  let description = "";
  let body = content;

  if (content.startsWith("---")) {
    const end = content.indexOf("\n---", 3);
    if (end === -1) {
      lints.push({ level: "error", message: "Frontmatter never closes (missing second ---)" });
    } else {
      const yaml = content.slice(3, end);
      body = content.slice(end + 4);
      name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
      // description may be a single line or a folded block (>-)
      const descMatch = yaml.match(/^description:\s*(?:>-?\s*\n((?:[ \t]+.+\n?)+)|(.+)$)/m);
      description = (descMatch?.[1] ?? descMatch?.[2] ?? "").replace(/\s+/g, " ").trim();
    }
  } else {
    lints.push({ level: "error", message: "No YAML frontmatter — agents can't see this skill" });
  }

  if (!name) {
    lints.push({ level: "error", message: "Missing name: in frontmatter" });
  } else if (name !== skillName) {
    lints.push({ level: "warn", message: `name: "${name}" ≠ directory name "${skillName}"` });
  }

  if (!description) {
    lints.push({ level: "error", message: "Missing description: — the description is the trigger" });
  } else {
    if (!/use (this skill )?when|use (it )?for|trigger/i.test(description)) {
      lints.push({
        level: "warn",
        message: "Description has no “Use when…” phrasing — agents trigger on it",
      });
    }
    if (description.length < 30) {
      lints.push({ level: "warn", message: `Description is thin (${description.length} chars) — name concrete triggers` });
    }
    if (description.length > 1024) {
      lints.push({ level: "error", message: `Description is ${description.length} chars (spec max 1024)` });
    }
  }

  if (body.trim().length < 40) {
    lints.push({ level: "warn", message: "Body is nearly empty — the skill has nothing to teach" });
  }

  if (!lints.length) {
    lints.push({ level: "ok", message: "Looks good — trigger phrasing present, frontmatter valid" });
  }
  return lints;
}

/// Rough token cost of what this skill injects into EVERY session.
function injectionTokens(content: string): number {
  const yamlEnd = content.startsWith("---") ? content.indexOf("\n---", 3) : -1;
  const head = yamlEnd === -1 ? content.slice(0, 200) : content.slice(0, yamlEnd);
  return Math.round(head.length / 4);
}

export function SkillEditor({
  name,
  initial,
  onClose,
}: {
  name: string;
  initial: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState(initial);
  const dirty = content !== initial;

  const lints = useMemo(() => lintSkill(content, name), [content, name]);
  const tokens = useMemo(() => injectionTokens(content), [content]);

  const save = useMutation({
    mutationFn: () => api.saveSkillFile(name, "SKILL.md", content),
    onSuccess: () => {
      toast(`Saved ${name}/SKILL.md`, "ok");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(String(e), "error"),
  });

  // Cmd/Ctrl+S saves, Esc closes (asks nothing — save state is visible)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save.mutate();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save, onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-ink/20 flex items-center justify-center">
      <div className="rise-in bg-paper-raised border border-line-strong rounded-lg w-[min(1240px,94vw)] h-[88vh] flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[13px]">{name}/SKILL.md</span>
            {dirty && <Badge tone="warn">unsaved</Badge>}
            <Mono title="Tokens this skill's frontmatter injects into every agent session">
              ~{tokens} tok/session
            </Mono>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
              {save.isPending ? <Spinner /> : "Save (⌘S)"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close (Esc)
            </Button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 min-h-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none outline-none bg-paper-sunken/40 border-r border-line p-4 font-mono text-[12.5px] leading-[1.55] select-text"
            style={{ userSelect: "text" }}
          />
          <div className="h-full overflow-y-auto p-5">
            <SkillMarkdown content={content} />
          </div>
        </div>

        <div className="border-t border-line px-4 py-2 shrink-0 max-h-[120px] overflow-y-auto">
          <SectionLabel>Description lint — the description is the trigger</SectionLabel>
          <div className="flex flex-col gap-0.5">
            {lints.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span
                  className={cx(
                    "font-semibold",
                    l.level === "error" && "text-danger",
                    l.level === "warn" && "text-warn",
                    l.level === "ok" && "text-ok",
                  )}
                >
                  {l.level === "error" ? "✗" : l.level === "warn" ? "!" : "✓"}
                </span>
                <span className="text-ink-soft">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
