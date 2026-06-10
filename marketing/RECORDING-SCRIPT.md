# Loadout — full recording script (word-for-word)

Target runtime: **2:30–2:45**. Record screen + voice together if you can; the energy is
better than dubbing after. If you flub a line, pause two seconds and restart the sentence —
cut it in the edit.

---

## Before you hit record

- [ ] Resolution 1920×1080, app in **dark mode**
- [ ] Terminal ready with a big, readable font (16pt+), `cd` into a real project repo
- [ ] Loadout open with: an `everything` base profile + one small project profile (e.g. `work` or `go`)
- [ ] One pending skill update visible in Library (so the diff button has something to show)
- [ ] A real share link ready in a browser tab (loadout.gilla.fun/s/…)
- [ ] `loadout.json` open in an editor tab
- [ ] Notifications OFF (macOS Focus mode)
- [ ] Run the Beat 3 switch once as a rehearsal — it's the money shot

---

## SCENE 1 — The problem (0:00–0:22)

**SCREEN:** Your terminal, nothing else. Type and run:

```
ls ~/.claude/skills | wc -l
```

Let the number sit on screen for a beat before you speak over it.

**SAY:**

> "That's how many skills I have installed for my coding agents. A hundred and six.
>
> And here's the problem nobody talks about: Claude Code reads every single one of them,
> in every single session. When I'm writing Go, my React design guidelines are sitting
> in context. When I'm writing docs, my database migration skill is along for the ride.
>
> There is no off switch. The only way to turn a skill off… is to uninstall it."

*(Pause one beat.)*

> "So I built one."

---

## SCENE 2 — Meet Loadout (0:22–0:48)

**SCREEN:** Cmd-Tab to Loadout, landing on the **Library** view. Scroll the table slowly —
let the volume of skills register. Then click one skill so the inspector opens with the
rendered SKILL.md and file tree.

**SAY:**

> "This is Loadout. Every skill on my machine, on one screen — every agent, every version.
>
> When I first opened it, it found everything my other tools had installed — Claude Code,
> Cursor, Codex — and imported all of it in one click. It took a backup first.
>
> Click any skill and you see exactly what your agent reads. The rendered instructions,
> the full file tree — and if a skill ships executable scripts, they're flagged. Right there."

---

## SCENE 3 — Profiles: the headline (0:48–1:30)

**SCREEN:** Switch to **Profiles**. Show `everything`, then your small project profile.
Then set up the proof: Loadout on one side, terminal on the other (split screen or
picture-in-picture). In the terminal, run:

```
ls .claude/skills
```

…inside your project repo. Leave the output visible. Then in **Projects**, switch the
project's profile. Re-run `ls .claude/skills`. The contents change on camera.

**SAY:**

> "Here's the headline feature.
>
> A profile is a named kit of skills. I have a TypeScript kit. A Go kit. A writing kit.
> You assign one to a project.
>
> Now watch the project's actual skills directory. This is what my agent sees right now.
>
> *(switch the profile)*
>
> One click… *(re-run ls)* …and the whole kit swaps.
>
> It's symlinks under the hood. So it's instant, it works offline, and it's completely
> reversible. Your agent's context only carries what the job actually needs."

*(Direction: do NOT talk while typing the second `ls`. Type, let the new output land,
THEN say "and the whole kit swaps." The silence sells it.)*

---

## SCENE 4 — Trust and updates (1:30–1:58)

**SCREEN:** **Discover** tab → trending list from skills.sh → click **Add** on one →
the trust panel opens, with a `scripts` badge visible. Then jump to **Library**, find the
pending update, click **diff**, scroll it for two seconds.

**SAY:**

> "Installing new skills is trust-first. Before anything touches your disk, you see the
> rendered skill, the complete file list, and any executable scripts — flagged.
>
> Because here's the thing: skills are instructions injected straight into your agent.
> You should read them the way you'd read a dependency.
>
> And updates? Pinned by default. When a skill changes upstream, you see the diff,
> you apply it in one click — and if it breaks something, you roll back in one click."

---

## SCENE 5 — Share and teams (1:58–2:22)

**SCREEN:** Browser tab with your real share link on loadout.gilla.fun. Scroll the share
page briefly. Then flash the `loadout.json` editor tab for about two seconds.

**SAY:**

> "Your loadout is also shareable. This is my actual kit, as a link. No account, no signup —
> the whole loadout travels inside the URL itself. There's no server storing anything.
>
> And for teams: commit a loadout.json to your repo. Every engineer on the project gets
> the identical skill environment, pinned to exact commits, from a single click."

---

## SCENE 6 — Close (2:22–2:40)

**SCREEN:** The landing page hero on loadout.gilla.fun, hold two seconds, then the GitHub repo.

**SAY:**

> "Loadout is free and open source. It's a single native binary — no Node, no runtime —
> for macOS and Linux. It works with the skills you already have, alongside the tools
> you already use.
>
> Stop carrying every weapon. Build your kit.
>
> Link's below."

*(End on the repo page. Hold three seconds of silence before stopping the recording —
gives you room for the end-card in the edit.)*

---

## Delivery notes

- Speak ~10% slower than feels natural. Cut dead air in the edit, not in the take.
- Say "a hundred and six," never "one-oh-six."
- The two moments that carry the whole video: the `wc -l` number in Scene 1, and the
  `ls` before/after in Scene 3. Everything else can be loose — those two must be clean.
- If a take runs long, cut Scene 4's second paragraph ("Because here's the thing…")
  first; it's the most droppable line.
- Don't smile-read. Scene 1 is a complaint — sound mildly annoyed. Scene 3 is the reveal —
  let the pace pick up there.
