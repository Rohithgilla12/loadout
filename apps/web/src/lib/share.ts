/**
 * Share links are fully serverless: the loadout payload travels in the URL
 * fragment (never sent to any server) as base64url-encoded JSON.
 *   loadout.dev/#L=<base64url>
 */

export interface SharedSkill {
  source: string;
  skill: string;
  rev?: string;
}

export interface SharedLoadout {
  /** display name of the person sharing */
  by?: string;
  /** profile name */
  profile: string;
  note?: string;
  skills: SharedSkill[];
}

function toBase64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeLoadout(loadout: SharedLoadout): string {
  return toBase64Url(JSON.stringify(loadout));
}

export function decodeLoadout(encoded: string): SharedLoadout | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.profile !== "string" || !Array.isArray(parsed.skills)) return null;
    const skills: SharedSkill[] = [];
    for (const s of parsed.skills) {
      if (typeof s?.source === "string" && typeof s?.skill === "string") {
        skills.push({ source: s.source, skill: s.skill, rev: typeof s.rev === "string" ? s.rev : undefined });
      }
    }
    return {
      by: typeof parsed.by === "string" ? parsed.by.slice(0, 60) : undefined,
      profile: parsed.profile.slice(0, 60),
      note: typeof parsed.note === "string" ? parsed.note.slice(0, 280) : undefined,
      skills: skills.slice(0, 100),
    };
  } catch {
    return null;
  }
}

export function shareUrl(loadout: SharedLoadout): string {
  return `${location.origin}${location.pathname}#L=${encodeLoadout(loadout)}`;
}

export function readShareFromHash(): SharedLoadout | null {
  const m = location.hash.match(/^#L=(.+)$/);
  return m ? decodeLoadout(m[1]) : null;
}

export function readSlugFromPath(): string | null {
  const m = location.pathname.match(/^\/s\/([a-z0-9-]{3,32})$/);
  return m ? m[1] : null;
}

const ADMIN_STORAGE_KEY = "loadout-admin-key";

/** `#admin=KEY` once in the URL stores the admin key locally, then disappears. */
export function captureAdminKey() {
  const m = location.hash.match(/^#admin=(.+)$/);
  if (m) {
    localStorage.setItem(ADMIN_STORAGE_KEY, m[1]);
    history.replaceState(null, "", location.pathname);
  }
}

export function adminHeaders(): Record<string, string> {
  const key = localStorage.getItem(ADMIN_STORAGE_KEY);
  return key ? { "x-loadout-admin": key } : {};
}

export interface SlugCheck {
  valid: boolean;
  reserved: boolean;
  available: boolean;
}

export async function checkSlug(slug: string): Promise<SlugCheck | null> {
  try {
    const resp = await fetch(`/api/slug/${encodeURIComponent(slug)}`, { headers: adminHeaders() });
    if (!resp.ok) return null;
    return (await resp.json()) as SlugCheck;
  } catch {
    return null;
  }
}

/** Create a short link via the Workers API. Returns the url, or an error
 *  string the UI can show; null when the API is unreachable (fall back to #L=). */
export async function createShortLink(
  loadout: SharedLoadout,
  slug?: string,
): Promise<{ url?: string; error?: string } | null> {
  try {
    const resp = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ ...loadout, ...(slug ? { slug } : {}) }),
    });
    const data = (await resp.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!resp.ok) return { error: data.error ?? `failed (${resp.status})` };
    return typeof data.url === "string" ? { url: data.url } : null;
  } catch {
    return null;
  }
}

export async function fetchSharedLoadout(slug: string): Promise<SharedLoadout | null> {
  try {
    const resp = await fetch(`/api/share/${slug}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    // same defensive shape-check as the fragment path
    return decodeLoadout(toBase64Url(JSON.stringify(data)));
  } catch {
    return null;
  }
}

/** Convert a shared loadout to a committable loadout.json body. */
export function toLoadoutJson(l: SharedLoadout): string {
  return JSON.stringify(
    {
      $schema: "https://loadout.dev/schema/v1.json",
      profile: l.profile,
      extends: [],
      skills: l.skills.map((s) => ({
        source: s.source,
        skill: s.skill,
        ...(s.rev ? { rev: s.rev } : {}),
      })),
    },
    null,
    2,
  );
}
