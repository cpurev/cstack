#!/usr/bin/env node
// Drive a page in Lightpanda (CDP) and report what a user would hit.
//
// Usage:
//   run.mjs <url>                      open the page, print a UI summary + errors
//   run.mjs <url> <script.mjs>         same, then run the script's default export (page, h)
//   run.mjs <url> -e "await h.click('text=Sign in'); h.expectUrl('/auth')"
//
// Flags: --timeout MS (default 15000), --base URL (prefix for relative hrefs in output)
// Env:   LIGHTPANDA_BIN (default: lightpanda on PATH or ~/.local/bin/lightpanda)
//        LIGHTPANDA_WS  (connect to an already running server instead of spawning one)
//
// Exit code 1 when the script threw or an expectation failed; console/network errors are
// reported but don't fail the run on their own.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const timeout = Number(opt("--timeout", 15000));
const inline = opt("-e", null);
const [url, scriptPath] = args;
if (!url) {
  console.error("usage: run.mjs <url> [script.mjs | -e code]");
  process.exit(2);
}

// ---- server -------------------------------------------------------------------------

async function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function startServer() {
  if (process.env.LIGHTPANDA_WS) return { ws: process.env.LIGHTPANDA_WS, proc: null };
  const bin =
    process.env.LIGHTPANDA_BIN ||
    (existsSync(path.join(os.homedir(), ".local/bin/lightpanda")) ? path.join(os.homedir(), ".local/bin/lightpanda") : "lightpanda");
  let port = 9222;
  while (!(await portFree(port))) port++;
  const proc = spawn(bin, ["serve", "--host", "127.0.0.1", "--port", String(port), "--log-level", "warn"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d));
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`lightpanda exited: ${stderr.trim() || "is it installed? see README"}`);
    if (!(await portFree(port))) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { ws: `ws://127.0.0.1:${port}`, proc };
}

// ---- helpers exposed to scripts --------------------------------------------------------

const failures = [];
function makeHelpers(page) {
  // Resolve a CSS selector or "text=Exact label" to an element handle. Text matching uses
  // textContent (Lightpanda has no layout, so innerText is unreliable) and climbs to the
  // nearest clickable ancestor.
  const sel = async (s) => {
    const handle = s.startsWith("text=")
      ? await page.evaluateHandle((t) => {
          const norm = (x) => (x || "").replace(/\s+/g, " ").trim();
          const all = [...document.querySelectorAll("body *")].filter((e) => !["SCRIPT", "STYLE"].includes(e.tagName));
          // smallest element whose own text equals t
          const hit = all.filter((e) => norm(e.textContent) === t).sort((a, b) => a.textContent.length - b.textContent.length)
            .find((e) => ![...e.children].some((c) => norm(c.textContent) === t));
          return hit ? hit.closest("a,button,[role=button],[role=link],label,summary,[onclick]") || hit : null;
        }, s.slice(5))
      : await page.$(s);
    const el = handle && (await handle.evaluate((e) => (e ? { tag: e.tagName.toLowerCase(), href: e.getAttribute("href") } : null)));
    if (!el) throw new Error(`no element matches ${s}`);
    return handle;
  };
  // DOM click rather than a mouse click at coordinates: there is no layout to aim at.
  const domClick = async (handle) => {
    await handle.evaluate((e) => e.click());
    await settle(page);
  };
  const h = {
    async goto(u) { await page.goto(u, { waitUntil: "networkidle0", timeout }); },
    async click(s) { await domClick(await sel(s)); },
    async type(s, text) { const el = await sel(s); await el.focus(); await el.type(text); },
    async text(s = "body") { return (await page.$eval(s, (e) => e.innerText || e.textContent)).trim(); },
    async exists(s) { try { await sel(s); return true; } catch { return false; } },
    url() { return page.url(); },
    expect(cond, msg) { if (!cond) failures.push(msg); return !!cond; },
    expectUrl(part) { return h.expect(page.url().includes(part), `expected url to include "${part}", got ${page.url()}`); },
    async expectText(t) { const body = await h.text(); return h.expect(body.includes(t), `expected page text to include "${t}"`); },
    async expectNoText(t) { const body = await h.text(); return h.expect(!body.includes(t), `expected page text NOT to include "${t}"`); },
    summary: () => summary(page),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  return h;
}

async function settle(page) {
  try { await page.waitForNetworkIdle({ idleTime: 300, timeout: Math.min(timeout, 5000) }); } catch {}
}

// What a user (or screen reader) can see and do on the page, from the DOM. No pixels.
async function summary(page) {
  return page.evaluate(() => {
    const vis = (e) => !e.hidden && !e.closest("[hidden],[aria-hidden=true]") && getComputedStyle(e).display !== "none";
    const name = (e) =>
      (e.getAttribute("aria-label") || (e.labels && [...e.labels].map((l) => l.innerText).join(" ")) || e.innerText || e.querySelector?.("img[alt]")?.alt || e.getAttribute("placeholder") || e.getAttribute("title") || e.value || "")
        .trim().replace(/\s+/g, " ").slice(0, 60);
    const pick = (q, f) => [...document.querySelectorAll(q)].filter(vis).map(f);
    return {
      title: document.title,
      headings: pick("h1,h2,h3", (e) => `${e.tagName.toLowerCase()} ${name(e)}`),
      landmarks: pick("main,nav,header,footer,aside,form,[role=dialog],[role=alert]", (e) => e.getAttribute("role") || e.tagName.toLowerCase()),
      actions: pick("a[href],button,[role=button],input[type=submit]", (e) => `${e.tagName.toLowerCase()}${e.disabled ? "(disabled)" : ""} "${name(e)}"${e.href ? " -> " + e.getAttribute("href") : ""}`),
      fields: pick("input:not([type=hidden]):not([type=submit]),select,textarea", (e) => `${e.tagName.toLowerCase()}[${e.type || ""}] "${name(e) || "(unlabelled)"}"${e.required ? " required" : ""}`),
      unlabelled: pick("input:not([type=hidden]):not([type=submit]),select,textarea,button,a[href]", (e) => (name(e) ? null : e.outerHTML.slice(0, 80))).filter(Boolean),
      imagesWithoutAlt: pick("img:not([alt])", (e) => e.getAttribute("src")?.slice(0, 80)),
      textChars: (document.body?.innerText || "").length,
    };
  });
}

// ---- main ------------------------------------------------------------------------------

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
let server;
let browser;
let exit = 0;
try {
  server = await startServer();
  browser = await puppeteer.connect({ browserWSEndpoint: server.ws, defaultViewport: null });
  const page = (await browser.pages())[0] || (await browser.newPage());
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} (${r.failure()?.errorText})`));
  page.on("response", (r) => { if (r.status() >= 400) failedRequests.push(`${r.request().method()} ${r.url().slice(0, 120)} -> ${r.status()}`); });

  const h = makeHelpers(page);
  await h.goto(url);

  if (scriptPath || inline) {
    let fn;
    if (inline) fn = new Function("page", "h", `return (async () => { ${inline} })()`);
    else fn = (await import(pathToFileURL(path.resolve(scriptPath)).href)).default;
    try { await fn(page, h); } catch (e) { failures.push(`script threw: ${e.message}`); }
  }

  const s = await summary(page);
  const out = { url: page.url(), ...s, consoleErrors: consoleErrors.slice(0, 20), pageErrors: pageErrors.slice(0, 10), failedRequests: failedRequests.slice(0, 20), failures };
  console.log(JSON.stringify(out, null, 1));
  if (failures.length) exit = 1;
} catch (e) {
  console.error(`error: ${e.message}`);
  exit = 1;
} finally {
  try { await browser?.disconnect(); } catch {}
  server?.proc?.kill();
  process.exit(exit);
}
