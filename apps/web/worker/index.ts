/**
 * loadout.gilla.fun — static assets + a tiny share API.
 *
 * POST /api/share        {by?, profile, note?, skills[]} → {slug, url}
 * GET  /api/share/:slug  → the stored loadout JSON
 *
 * Shares are immutable once created (no edit, no delete, no accounts) and
 * stored forever in KV. The legacy #L= fragment links keep working entirely
 * client-side — this API only adds short links.
 */

// Env comes from worker-configuration.d.ts — regenerate with `wrangler types`

const MAX_BODY_BYTES = 32 * 1024;
const MAX_SKILLS = 100;
const SLUG_LENGTH = 8;
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/O/1/l/i

function newSlug(): string {
  // rejection sampling: keep slugs uniform over the 31-char alphabet
  const limit = 256 - (256 % SLUG_ALPHABET.length);
  let out = "";
  while (out.length < SLUG_LENGTH) {
    const bytes = new Uint8Array(SLUG_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < SLUG_LENGTH) {
        out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
      }
    }
  }
  return out;
}

interface SharedSkill {
  source: string;
  skill: string;
  rev?: string;
}

interface SharedLoadout {
  by?: string;
  profile: string;
  note?: string;
  skills: SharedSkill[];
}

/** Re-build the payload field by field — nothing we didn't ask for is stored. */
function sanitize(input: unknown): SharedLoadout | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.profile !== "string" || !o.profile.trim()) return null;
  if (!Array.isArray(o.skills) || o.skills.length === 0) return null;
  const skills: SharedSkill[] = [];
  for (const raw of o.skills.slice(0, MAX_SKILLS)) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.source !== "string" || typeof s.skill !== "string") continue;
    skills.push({
      source: s.source.slice(0, 200),
      skill: s.skill.slice(0, 100),
      ...(typeof s.rev === "string" ? { rev: s.rev.slice(0, 64) } : {}),
    });
  }
  if (!skills.length) return null;
  return {
    ...(typeof o.by === "string" && o.by.trim() ? { by: o.by.slice(0, 60) } : {}),
    profile: o.profile.slice(0, 60),
    ...(typeof o.note === "string" && o.note.trim() ? { note: o.note.slice(0, 280) } : {}),
    skills,
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/share" && request.method === "POST") {
      // guard the read itself, not just the (spoofable/absent) content-length
      const length = Number(request.headers.get("content-length") ?? "0");
      if (length > MAX_BODY_BYTES) {
        return json({ error: "loadout too large" }, 413);
      }
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return json({ error: "loadout too large" }, 413);
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      const loadout = sanitize(body);
      if (!loadout) {
        return json({ error: "expected {profile, skills: [{source, skill}]}" }, 400);
      }
      const slug = newSlug();
      await env.SHARES.put(`s:${slug}`, JSON.stringify(loadout));
      return json({ slug, url: `${url.origin}/s/${slug}` }, 201);
    }

    const shareMatch = url.pathname.match(/^\/api\/share\/([a-z0-9]{4,16})$/);
    if (shareMatch && request.method === "GET") {
      const stored = await env.SHARES.get(`s:${shareMatch[1]}`);
      if (!stored) return json({ error: "not found" }, 404);
      return json(JSON.parse(stored), 200, {
        // shares are immutable — let the edge cache them hard
        "cache-control": "public, max-age=31536000, immutable",
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not found" }, 404);
    }

    // everything else: static assets / SPA fallback
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
