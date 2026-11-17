---
name: implement
description: Build a new feature with a split of roles. This session (Opus or Fable) designs and reviews; Sonnet subagents write the code. Use for /implement, "build X", "add this feature", "implement this ticket/spec".
---

# implement

You own the design and the verdict. Sonnet workers own the typing. Delegation pays only
when a worker writes a lot relative to what it has to read, so delegate volume, not
everything.

## Angle

- **Is this worth delegating?** One or two files, or under ~100 lines: write it yourself.
  The brief, the worker's re-reading, and your review would cost more than the code.
- **What already does something like this?** Find the nearest existing feature. Its shape
  (layout, naming, error handling, tests) is what the worker copies.
- **What's the contract?** Types, signatures, routes, columns, and names are design. Decide
  them before a worker starts. Workers fill in bodies; they don't pick shapes.
- **What proves it works?** A command and its expected result. If you can't name it, the
  work isn't scoped yet.

## Budget

One worker by default. Run more in parallel only when slices own disjoint files and each one
is substantial; at most 3 in flight. One fix round per worker. If it's still wrong, the
brief was wrong: rewrite it or finish the change yourself.

## Steps

1. **Ground.** Read `CLAUDE.md`, the closest existing feature, and the files you'll touch.
   Find the test, lint, and type-check commands.
2. **Plan.** State the contract and the slices in a few lines and proceed. Stop for "go"
   only for a real decision (product choice, migration, auth, billing), in fix-it's
   `Decision needed` format.
3. **Contract.** If slices share types, interfaces, or a migration, write those yourself
   as stubs first.
4. **Dispatch.** `Agent` with `subagent_type: "cstack:implementer"` and `model: "sonnet"`.
   Paste what the worker needs so it doesn't explore:

   ```
   Goal: <one line, in user terms>
   Contract: <the exact types and signatures, pasted>
   Follow: <path:lines of the code to imitate, plus the key lines pasted>
   Write only: <files>
   Tests: <cases to add, in which file>
   Evidence: <command> -> <expected result>
   Don't: <commits, new deps, touching X>
   ```

5. **Review.** `git status` for files outside scope. Read the diff, not the summary. Run
   the evidence command yourself. Findings go back via `SendMessage` as
   `file:line: problem -> fix`.
6. **Integrate.** Run lint, types, and the area's tests once.
7. Don't commit. Suggest `/cstack:deslop` and then `/cstack:review`.

## Output

- **Built:** two or three sentences, in user terms.
- **Work:** who wrote what (you or worker), files, evidence result.
- **Decisions:** what you chose and why, one line each.
- **Not done:** unverified paths, follow-ups, anything a worker flagged.
