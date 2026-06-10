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
const CUSTOM_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/// Premium namespace: claimable only with the admin key (only its hash lives here).
const RESERVED = new Set([
  "typescript", "ts", "javascript", "js", "dev", "go", "golang", "rust", "python", "py",
  "react", "next", "nextjs", "node", "frontend", "backend", "fullstack", "ai", "ml",
  "claude", "claude-code", "cursor", "codex", "copilot", "web", "design", "devops",
  "infra", "data", "mobile", "ios", "android", "base", "work", "everything", "default",
  "admin", "api", "app", "www", "share", "loadout", "rohith", "gilla", "premium", "pro",
  "team", "official", "vibe", "vibes", "starter", "minimal",
]);
const ADMIN_KEY_SHA256 = "d3bdb82150a482480bf724c9daf92f7a5c06df66363d2b57f07b32b71ede479f";

async function isAdmin(request: Request): Promise<boolean> {
  const key = request.headers.get("x-loadout-admin");
  if (!key) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === ADMIN_KEY_SHA256;
}

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
      // custom slug: validated, reserved names need the admin key, no overwrites
      let slug: string;
      const requested = (body as Record<string, unknown>).slug;
      if (typeof requested === "string" && requested.length > 0) {
        const wanted = requested.toLowerCase();
        if (!CUSTOM_SLUG_RE.test(wanted)) {
          return json({ error: "slug must be 3–32 chars: a–z, 0–9, hyphens inside" }, 400);
        }
        if (RESERVED.has(wanted) && !(await isAdmin(request))) {
          return json({ error: "that slug is reserved" }, 403);
        }
        if (await env.SHARES.get(`s:${wanted}`)) {
          return json({ error: "that slug is taken" }, 409);
        }
        slug = wanted;
      } else {
        slug = newSlug();
      }
      await env.SHARES.put(`s:${slug}`, JSON.stringify(loadout));
      return json({ slug, url: `${url.origin}/s/${slug}` }, 201);
    }

    // availability check for custom slugs
    const availMatch = url.pathname.match(/^\/api\/slug\/([a-z0-9-]{1,40})$/);
    if (availMatch && request.method === "GET") {
      const wanted = availMatch[1];
      const valid = CUSTOM_SLUG_RE.test(wanted);
      const reserved = RESERVED.has(wanted);
      const taken = valid ? (await env.SHARES.get(`s:${wanted}`)) !== null : false;
      return json({
        slug: wanted,
        valid,
        reserved,
        available: valid && !taken && (!reserved || (await isAdmin(request))),
      });
    }

    const shareMatch = url.pathname.match(/^\/api\/share\/([a-z0-9-]{3,32})$/);
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
