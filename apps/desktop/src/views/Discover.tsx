import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge, Button, Input, Mono, SectionLabel, Spinner } from "../components/ui";
import { InstallFlow } from "../components/InstallFlow";

interface RegistrySkill {
  name: string;
  source: string;
  description?: string;
  installs?: number;
}

/// The skills.sh API is undocumented and may change shape; parse defensively.
/// Registry being down must never break the app — the git-URL path is P0.
function parseRegistry(data: unknown): RegistrySkill[] {
  const out: RegistrySkill[] = [];
  const items: unknown[] = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null
      ? ((data as Record<string, unknown>).skills as unknown[]) ??
        ((data as Record<string, unknown>).items as unknown[]) ??
        ((data as Record<string, unknown>).results as unknown[]) ??
        []
      : [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : typeof o.skill === "string" ? o.skill : null;
    const source =
      typeof o.source === "string"
        ? o.source
        : typeof o.repo === "string"
          ? o.repo
          : typeof o.repository === "string"
            ? o.repository
            : null;
    if (!name || !source) continue;
    out.push({
      name,
      source,
      description: typeof o.description === "string" ? o.description : undefined,
      installs:
        typeof o.installs === "number"
          ? o.installs
          : typeof o.installCount === "number"
            ? (o.installCount as number)
            : undefined,
    });
  }
  return out;
}

/// Curated fallback shown when the registry API is unreachable: well-known
/// public skill repos, all installable through the normal git path.
const FEATURED: Array<{ source: string; note: string }> = [
  { source: "anthropics/skills", note: "Anthropic's official skills — docs, PDFs, frontend design" },
  { source: "vercel-labs/agent-skills", note: "Vercel's agent skills — React & Next.js best practices" },
  { source: "obra/superpowers", note: "Battle-tested workflows: TDD, debugging, code review" },
];

export function Discover() {
  const [search, setSearch] = useState("");
  const [installInput, setInstallInput] = useState<string | undefined>();

  const registry = useQuery({
    queryKey: ["registry", search],
    queryFn: async () => {
      const path = search.trim() ? `skills?q=${encodeURIComponent(search.trim())}` : "skills";
      return parseRegistry(await api.registryGet(path));
    },
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  return (
    <div className="p-5 max-w-3xl">
      <h2 className="text-[16px] font-semibold tracking-tight">Discover</h2>
      <p className="text-[12.5px] text-ink-soft mt-0.5 mb-4">
        Install from anywhere git lives — or browse the skills.sh registry. Every install goes
        through a trust review first.
      </p>

      <SectionLabel>Install from source</SectionLabel>
      <InstallFlow key={installInput ?? "blank"} initialInput={installInput} onDone={() => setInstallInput(undefined)} />

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <SectionLabel>skills.sh registry</SectionLabel>
          <Input
            placeholder="search the registry…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[240px] ml-auto"
          />
        </div>

        {registry.isLoading && <Spinner />}

        {registry.isError && (
          <div className="border border-line rounded-lg p-4 text-[12.5px]">
            <div className="text-ink-soft mb-3">
              Registry unreachable right now — that's fine, installs don't depend on it. Some
              well-known skill repos:
            </div>
            <div className="flex flex-col gap-2">
              {FEATURED.map((f) => (
                <div key={f.source} className="flex items-center justify-between">
                  <div>
                    <Mono className="text-ink font-medium">{f.source}</Mono>
                    <div className="text-[11.5px] text-ink-faint">{f.note}</div>
                  </div>
                  <Button onClick={() => setInstallInput(f.source)}>Fetch</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {registry.data && (
          <div className="border border-line rounded-lg overflow-hidden">
            {registry.data.length === 0 && (
              <div className="p-4 text-[12.5px] text-ink-faint">No results.</div>
            )}
            {registry.data.map((s) => (
              <div
                key={`${s.source}/${s.name}`}
                className="flex items-center justify-between px-4 py-2.5 border-b border-line/60 last:border-0 hover:bg-paper-sunken/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px]">{s.name}</span>
                    <Mono>{s.source}</Mono>
                    {s.installs != null && <Badge tone="neutral">{s.installs.toLocaleString()} installs</Badge>}
                  </div>
                  {s.description && (
                    <div className="text-[11.5px] text-ink-faint truncate mt-0.5">{s.description}</div>
                  )}
                </div>
                <Button className="shrink-0 ml-3" onClick={() => setInstallInput(s.source)}>
                  Fetch
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
