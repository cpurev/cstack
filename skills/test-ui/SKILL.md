---
name: test-ui
description: Test a web UI the way a user would, by driving it in Lightpanda (a fast headless browser for agents) and reporting what works, what breaks, and what a user would hit. Flows, forms, navigation, empty and error states, console and network errors, labels and semantics. Use for /test-ui, "test the UI", "does this page work", "QA this flow", "check the UX of X", "is the frontend broken". No pixels: for visual layout use a real browser.
---

# test-ui

## Angle

Testing the happy path tells you nothing you didn't know. Users don't walk the happy path.

- **Start where the user starts, not where the feature is.** Logged out, fresh account,
  empty state, deep link pasted into a new tab, page refreshed mid-flow, back button after
  submit.
- **Judge the outcome, not the absence of errors.** "Nothing threw" is not "it worked".
  Check the URL changed, the text the user needed is there, the thing they created exists.
- **Do what an impatient user does.** Submit an empty form. Submit twice. Type the wrong
  thing. Leave a required field blank. Does the page say what went wrong, in words?
- **Read the page as a screen reader would.** The runner's summary lists actions, fields,
  unlabelled controls, and images without alt. An unlabelled button is a bug, not a nit.
- **Errors in the console and failed requests count** even when the page looks fine. A 401
  on a background call or a hydration error is a user bug waiting for a slower network.

## What Lightpanda can and can't do

It runs real JS and DOM with no rendering engine, and starts in milliseconds. So: flows,
forms, navigation, text, semantics, console and network errors. **Not**: layout, overlap,
colors, responsive breakpoints, screenshots. If the question is visual, say so and use a
real browser (Playwright Chromium or the Chrome tools) instead of guessing.

## Budget

This session, no subagents. The runner prints a compact JSON summary per run; read that,
not the page source. One run per scenario, 3-6 scenarios per request. Don't install
Playwright or write a test suite unless asked; this is exploratory QA.

## How

The runner at `<this skill's dir>/scripts/run.mjs` spawns Lightpanda, opens the URL, runs
your steps, and prints: headings, landmarks, actions, fields, unlabelled controls, images
without alt, console errors, page errors, failed requests, and your failed expectations.
Exit 1 if an expectation failed.

```bash
node scripts/run.mjs http://localhost:5173/                 # look around
node scripts/run.mjs http://localhost:5173/jobs -e '
  await h.click("text=New job");  h.expectUrl("/jobs/new");
  await h.click("button[type=submit]");                       // empty submit
  await h.expectText("required");'                            // does it say so?
node scripts/run.mjs URL flow.mjs      # export default async (page, h) => { ... }
```

`h`: `goto click type text exists url expect expectUrl expectText expectNoText summary
sleep`. `click`/`type` take a CSS selector or `text=Exact label`. `page` is the puppeteer
page for anything else. Auth: pass cookies via `LIGHTPANDA_WS` to a server you started
with `lightpanda serve --cookie cookies.json`, or drive the login flow in the script (local
Supabase magic links land in Inbucket).

Dev server not running: say which command starts it and stop. Don't start it yourself.

## Output

Per scenario, one line: what you did, what happened, pass or fail. Then:

- **Bugs:** what a user hits, how to reproduce, the console or network evidence if any.
- **UX findings:** missing feedback, unlabelled controls, dead ends. Only what you observed.
- **Not covered:** visual checks, scenarios you couldn't run and why.
