---
name: fix-it
description: Fix a bug at its root cause, upstream, proven by a test, and say why it's not a band-aid before being asked. When a decision or missing fact blocks the fix, ask one short concrete question. Use for /fix-it, "fix this", "fix this properly", "this is a band-aid", "find the real cause".
---

# fix-it

## Angle

The place an error shows up is almost never the place to fix it. Keep asking:

- **"Why is this value wrong here?"** Repeat until the answer is "because this code made
  it". That's where the fix goes.
- **"Should this state be possible at all?"** If not, fix what makes it possible instead
  of guarding against it. Removing a way to be wrong beats adding a check.
- **"Who else produces or consumes this?"** `grep` for them. A fix that covers one path of
  three is a band-aid.
- **"What did the bug already write?"** Bad data in prod outlives the code fix. Say so.

## Done means

Answer each with evidence before reporting. The user should never have to ask.

- **Correct:** cause proven (reproduced, traced, or shown in data); a test fails before
  and passes after, for the bug's reason.
- **Robust:** holds for the other inputs reaching that code (empty, duplicate, concurrent,
  retried, existing bad rows).
- **Upstream:** fixed at the origin, all paths from it covered.
- **Not a band-aid:** no swallowed exception, consumer-side `None` guard, special-cased id,
  retry or sleep for a logic bug, `cast` / `type: ignore`, or skipped test, unless you state
  why it's the right call.

## Budget

This session, no subagents. Trace with `grep`, read only functions on the path, run the
single relevant test while iterating and the area's checks once at the end. For prod data
evidence, use `its-prod`.

## When blocked

Ask only if the answer changes what you do. Conventional choices: decide, state it in one
line. Otherwise stop and ask:

```
Decision needed: <one line>
Why: <what you found that makes it a choice>
A) <option>: <consequence>
B) <option>: <consequence>
Recommend: <A/B>, because <reason>
```

Missing fact: `Need: <fact>. Looked in: <places>. Default if unknown: <assumption>.`

Don't commit. Don't refactor beyond the fix; list follow-ups.

## Output

**Cause** (with `file.py:line`), **Fix**, **Done means** (one evidence line each),
**Not done** (bad data, follow-ups, anything unverified).
