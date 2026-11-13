// Optional browser test for app.html. Needs Google Chrome/Chromium on the PATH and Node 22+.
// Run: node tests/ui-smoke.js      (the engine tests in run-tests.js need nothing but Node)
"use strict";
const { spawn } = require("child_process"), path = require("path"), assert = require("assert");
const CHROME = process.env.CHROME_BIN || "google-chrome", PORT = 9333;
const url = "file://" + path.join(__dirname, "..", "app.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + PORT, "--user-data-dir=/tmp/talentops-ui-test", "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
  let failed = 0;
  try {
    let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json")).json(); break; } catch (e) { await sleep(250); } }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
    let id = 0; const pending = new Map(), errors = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text + " " + ((m.params.exceptionDetails.exception || {}).description || "")); };
    const send = (method, params) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
    const js = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + " in: " + expr); return r.result.result.value; };
    await send("Runtime.enable"); await send("Page.enable"); await send("Page.navigate", { url }); await sleep(1500);
    const names = () => js("[...document.querySelectorAll('.band .row .who b')].map(b=>b.textContent)");
    const setSelect = (sel, v) => js("(()=>{const s=document.querySelector('" + sel + "');s.value='" + v + "';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    const click = (sel) => js("document.querySelector(" + JSON.stringify(sel) + ").click()");
    const text = (sel) => js("(document.querySelector(" + JSON.stringify(sel) + ")||{textContent:''}).textContent");

    const tests = {
      "opens on JOB001 with a shortlist and an evidence panel already filled in": async () => {
        const n = await names(); assert.strictEqual(n.length, 11); assert.ok(n.includes("Lucas Evans"));
        assert.ok((await text(".detail h2")).length > 3); assert.ok(/Suggested next step/.test(await text(".detail .next")));
      },
      "clicking a contact shows that contact's evidence": async () => {
        await js("[...document.querySelectorAll('.row')].find(r=>r.textContent.includes('Marcus Reid')).click()");
        assert.strictEqual(await text(".detail h2"), "Marcus Reid"); assert.ok(/Event Detection sounds close/.test(await text(".detail")));
      },
      "switching the job changes the shortlist": async () => {
        await setSelect("#job", "JOB004"); const n = await names(); assert.ok(n.includes("Henry Wright") && !n.includes("Lucas Evans")); assert.ok(/Data Engineer/.test(await text(".jobcard h1")));
        await setSelect("#job", "JOB001");
      },
      "moving a weight slider reorders but keeps the same people shortlisted": async () => {
        const before = (await names()).slice().sort();
        await js("(()=>{const s=document.querySelector('#w-required');s.value='20';s.dispatchEvent(new Event('input',{bubbles:true}));})()");
        assert.deepStrictEqual((await names()).slice().sort(), before); assert.ok(/changed/.test(await text("details.weights summary")));
        await click("#reset"); assert.ok(!/changed/.test(await text("details.weights summary")));
      },
      "connection filter keeps only people who worked with a WSC employee": async () => {
        await setSelect("#conn", "worked"); const n = await names(); assert.ok(n.includes("Priya Anand") && !n.includes("Lucas Evans")); await setSelect("#conn", "any");
      },
      "search narrows the list": async () => {
        await js("(()=>{const s=document.querySelector('#q');s.value='chiara';s.dispatchEvent(new Event('input',{bubbles:true}));})()");
        assert.deepStrictEqual(await names(), ["Chiara Russo"]);
        await js("(()=>{const s=document.querySelector('#q');s.value='';s.dispatchEvent(new Event('input',{bubbles:true}));})()");
      },
      "export produces a CSV with one line per shortlisted contact": async () => {
        await click("#copy"); const csv = await js("document.querySelector('#csvbox').value");
        assert.strictEqual(csv.trim().split("\n").length, 12); assert.ok(csv.startsWith("hubspot_id,email,full_name"));
      },
      "talent pool lists all 75 contacts and filters by relevance": async () => {
        await click("#tab-pool"); assert.strictEqual(await js("document.querySelectorAll('table.pool tbody tr').length"), 75);
        await setSelect("#p-rel", "outside"); assert.strictEqual(await js("document.querySelectorAll('table.pool tbody tr').length"), 17);
      },
      "how-it-works shows the term table for the selected job": async () => {
        await click("#tab-how"); assert.ok(/YOLO/.test(await text("table.terms"))); await click("#tab-matches");
      },
      "no JavaScript errors were thrown": async () => { assert.deepStrictEqual(errors, []); },
    };
    for (const [name, fn] of Object.entries(tests)) { try { await fn(); console.log("  ok    " + name); } catch (e) { failed++; console.log("  FAIL  " + name + "\n        " + e.message); } }
    console.log("\n" + (Object.keys(tests).length - failed) + " of " + Object.keys(tests).length + " browser tests passed");
    ws.close();
  } finally { chrome.kill(); }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
