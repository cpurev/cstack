# cstack

Lightweight, fast Claude Code skills. One model, no subagents, a few KB each.

## Why cstack

Skill packs like pstack and gstack fan a single task out to several subagents and models
(Fable, Opus, Sonnet, Haiku) that review in parallel and then verify each other. A PR review
becomes slow and expensive.

cstack bets the other way. The model is already smart enough; it doesn't need to be told
to "act like a senior engineer" or handed a checklist of off-by-ones and race conditions.
What it gets wrong is the **angle**: it looks where the error shows up instead of where it
starts, reviews the diff instead of what the diff forgot, answers from code when the data
is one query away. A few precise questions fix that for almost no tokens.

So every skill is:

- **Angle**: the two to four questions the model wouldn't ask on its own. This is the
  skill's actual value.
- **Budget**: one model, this session, no subagents, read only what's needed, one pass.
- **Steps and output**: only what isn't obvious, plus a fixed output shape so results are
  consistent run to run.

| Skill | What it does |
|---|---|
| `/cstack:review` | Read-only branch review that looks at what the diff forgot: other callers, sibling paths, existing prod rows |
| `/cstack:fix-it` | Fixes at the origin, not the symptom; proves correct / robust / upstream / not a band-aid; asks short concrete decisions when blocked |
| `/cstack:fix-ci` | Gets checks green: is it this branch, first error, test or code wrong, local vs CI difference |
| `/cstack:its-prod` | Read-only prod database investigation: try to disprove, watch the denominator, cite the queries. Read-only enforced by `scripts/q.py` |
| `/cstack:test-ui` | Drives a web UI in Lightpanda like an impatient user: wrong starts, empty submits, outcomes not absence of errors, unlabelled controls. Functional and semantic, not visual |
| `/cstack:deslop` | Removes slop the branch added: "would this file's author have written this line?" |
| `/cstack:not-ai` | Edits prose to say the specific thing in the author's voice, without inventing anything |

## Install (local)

In Claude Code:

```
/plugin marketplace add ~/code/cstack
/plugin install cstack@cstack
```

After editing a skill, run `/plugin marketplace update cstack` and reinstall to pick up changes.

## Adding a skill

Create `skills/<name>/SKILL.md`, ideally under 3 KB:

```markdown
---
name: <name>
description: What it does + when to use it (trigger phrases).
---

## Angle
The questions the model wouldn't ask by itself. Not a persona, not a generic checklist.

## Budget
One model, no subagents, what to read and what not to, when to stop.

## Steps / Output
Only the non-obvious steps, and a fixed output shape.
```

Test for each line: would the model do this anyway? If yes, delete it.

Bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.

## its-prod setup

`its-prod` needs `asyncpg` in the Python env you run it from, and a short note in each
project's `CLAUDE.md` so the skill knows how to connect:

```markdown
## its-prod
- Prod DB URL env var: `MY_DATABASE_URL` (in `.env`; run `source .env` first)
- Needs the tunnel: `scripts/prod_db_tunnel.sh` running in another terminal
- No read replica: queries hit the primary
```

For a hard guarantee, point the env var at a Postgres role with only `SELECT` grants. The
script's read-only transaction already blocks writes; a read-only role is defense in depth.

## test-ui setup

`test-ui` drives [Lightpanda](https://lightpanda.io), a headless browser built for agents
(real JS and DOM, no rendering engine, starts in milliseconds). One-time setup:

```bash
# Lightpanda binary (Apple Silicon; see releases for x86_64 / Linux)
mkdir -p ~/.local/bin && curl -L -o ~/.local/bin/lightpanda \
  https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-aarch64-macos \
  && chmod +x ~/.local/bin/lightpanda
# puppeteer-core for the runner (no Chrome download)
cd skills/test-ui/scripts && npm install
```

The runner spawns `lightpanda serve` per run and kills it after. `LIGHTPANDA_BIN` overrides
the binary path; `LIGHTPANDA_WS=ws://127.0.0.1:9222` connects to a server you started
yourself (useful with `--cookie` for authenticated sessions).

Lightpanda can't render, so `test-ui` covers flows, forms, text, semantics, and console or
network errors, not layout or screenshots. Web API coverage is still growing; if a client
side router or framework feature misbehaves, check https://perf.lightpanda.io/wpt before
blaming the app.

## Credits

`not-ai` is adapted from `not-ai` 3.0 by udaysharmadev.
