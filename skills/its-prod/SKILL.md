---
name: its-prod
description: Answer a question or diagnose a bug from the PRODUCTION database using read-only queries, with cited evidence. Use for /its-prod, "check prod", "what does prod say", "how many X in prod", "why does org Y see Z", "is this happening in prod". Never writes, never fixes.
---

# its-prod

## Angle

Code says what should happen. Prod says what did. The answer is usually the gap: legacy
rows, nulls the code assumes away, a second org with different settings, a job that ran
twice.

- **Try to disprove, not confirm.** Design each query so a wrong hypothesis would show up.
  Cross-check a surprising result with a second, independent query.
- **Watch the denominator.** A count means nothing without its base, its time window, and
  whether soft-deleted, archived, or test-org rows are in it.
- **Don't answer from code when data is one query away.**

## Safety (non-negotiable)

- Every query goes through `python <this skill's dir>/scripts/q.py`. Never `psql`, an
  ad-hoc connection, or the app's session code. The script enforces one statement, a
  `READ ONLY` transaction, and a timeout.
- Asked to change data: stop, write the SQL in the reply labelled as a proposal, let the
  user run it.
- Assume you're on the primary. Filter on indexed columns (ids, foreign keys,
  `date_added` ranges); plain `EXPLAIN` first if unsure; on timeout, narrow the query.
- Personal data: select ids and only the columns the question needs. No names, emails,
  phones, CV text, or messages unless the question is about that exact record.
- Never print the connection URL or password.

## Budget

This session, no subagents. Learn the schema from the ORM models (`grep -n "class
.*(Base)"`, read the one you need); `--schema TABLE` only if the code is unclear. Count
before select, aggregate before list, always `LIMIT`. Stop at ~15 queries and report.

## Setup

The project's `CLAUDE.md` should have an "its-prod" note: which env var holds the URL and
whether a tunnel is needed. Run from the repo root:
`source .env && python <skill dir>/scripts/q.py --url-env <VAR> "SELECT 1"`.
On connection failure, say what's missing (tunnel, env, login) and stop. Don't start
tunnels or log in yourself.

`q.py "SQL"`, `q.py --schema TABLE`, `--rows N` (default 50), `--width N` (80),
`--check "SQL"` (validate only). Output is TSV with a `-- N row(s)` footer.

## Output

- **Answer:** one or two sentences.
- **Evidence:** the queries that mattered (SQL block) with the key result in one line each.
- **Cause** (for bugs): mechanism with `file.py:line`.
- **Open:** what's unverified and the query that would settle it.
