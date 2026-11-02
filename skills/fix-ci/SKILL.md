---
name: fix-ci
description: Get a PR's failing CI checks green by fixing the first real error at its cause. Use for /fix-ci, "why is CI red", "fix the build", "get checks green".
---

# fix-ci

## Angle

- **Did this branch cause it?** Check whether the same check fails on `main`
  (`gh run list --branch main --limit 5`). If it does, it's not this PR's bug; report it.
- **First error, not the last.** Later failures are usually a cascade of the first.
- **Is the test wrong or the code?** If the branch changed behavior on purpose, the test
  may need updating. Decide from the intent of the change, not from which edit is smaller.
- **Passes locally, fails in CI?** That's an environment difference (versions, env vars,
  timezone, test order, missing service). Find it; don't patch around it.

## Budget

This session, no subagents. Never read a whole log: `gh run view <id> --log-failed |
grep -n -B5 -A20 -iE "error|failed|assert"`. Rerun only the failing test while iterating.
Stop after 3 failed attempts on one error and report.

## Steps

1. `gh pr checks --json name,bucket,state,workflow,link`. No PR or no `gh`: ask for the log.
2. Take the first failing check, find its first real error, reproduce it locally.
3. Fix the cause. Never skip, xfail, loosen a lint rule, or `type: ignore` to go green
   without asking.
4. Next failing check. Flaky ones (pass on rerun, network, timeouts): report, don't fix.
5. When local checks pass, show the diff and ask before committing or pushing.

## Output

Root error per check, fix applied, local result, what's left.
