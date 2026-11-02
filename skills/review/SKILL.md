---
name: review
description: Review the current branch's diff for real bugs, CLAUDE.md rule breaks, and missing tests. Read-only. Use for /review, "review my branch", "check this before I open a PR".
---

# review

Read-only. Report findings, change nothing.

## Angle

You'll spot bugs inside the diff without help. The ones you miss sit at its edges:

- **What should have changed but didn't?** Other callers of a changed function, the
  sibling code path (create vs update, sync vs async, v1 vs v2 route), the model change
  with no migration, the behavior change with no test.
- **Existing data.** A new assumption (non-null, new enum value, new uniqueness, changed
  default) is false for rows already in prod until proven otherwise.
- **Does it do what it set out to do?** Read the commit messages or PR title, then check
  the diff actually achieves that, not just that the code is clean.
- **Is it already handled?** Before reporting a missing check, look one level up. A finding
  that upstream validation already prevents is noise.

## Budget

One pass, this session, no subagents. Start from `git diff -U5`; `grep -rn` for callers
instead of reading files; read beyond a hunk only to confirm a specific finding. Over
~1,500 changed lines, do the risky files first (migrations, auth, billing, deletes) and say
what you skipped.

## Steps

1. Diff: `git diff -U5 $(git merge-base HEAD main)` plus uncommitted changes, or the PR,
   file, or commit the user named.
2. Read `CLAUDE.md` once; note the rules that touch the changed files.
3. Go hunk by hunk with the angle above. Confirm each finding by tracing its one code path.

## Output

Most severe first:

- **`path/file.py:123`: one-line summary.** Concrete input or state, then the wrong result.
  Fix in one line.

No linter-level nits, no "consider maybe". End with one line: "ship it", "ship after
fixing N", or "needs rework".
