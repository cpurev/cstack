---
name: deslop
description: Remove AI-generated slop from the current branch's diff (needless comments, defensive guards, type escapes, dead code) without changing behavior. Use for /deslop, "clean up the slop", "de-AI this diff", tidying a branch before review.
---

# deslop

## Angle

- **Would whoever wrote the rest of this file have written this line?** Judge against the
  file's own style, not an ideal. A file with no comments shouldn't gain ten.
- **What breaks if I delete it?** Every added comment, guard, `try/except`, helper, log line,
  and `cast` / `Any` / `type: ignore` has to earn its place. If nothing breaks and nothing
  is lost for the reader, it goes.
- **Only what this branch added.** Pre-existing code is out of scope, even if it's sloppy.

## Budget

This session, no subagents, one pass. Work from the diff hunks and the few lines around
each. Run checks (lint, types, the touched tests) once at the end. Over ~800 changed lines,
ask which files to focus on.

## Steps

1. Diff: `git diff $(git merge-base HEAD main)` plus uncommitted changes.
2. Edit hunk by hunk with the angle above. Behavior must not change; if a removal would
   change it, leave it and say so.
3. Run the checks, fix anything you broke. Don't commit.

## Output

One to three sentences: what was removed, where, and anything left on purpose.
