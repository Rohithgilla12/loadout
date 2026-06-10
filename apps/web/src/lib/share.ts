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
