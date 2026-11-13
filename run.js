#!/usr/bin/env node
// Command-line entry point.  Usage: node run.js --job JOB001 [--all] [--data data] [--out output]
"use strict";
const fs = require("fs"), path = require("path");
const { runFromCsvText } = require("./src/pipeline.js");
const { exportMatches, STRENGTH_TEXT } = require("./src/exporter.js");

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const jobId = opt("job"), dataDir = opt("data", path.join(__dirname, "data")), outDir = opt("out", path.join(__dirname, "output"));
if (!jobId) { console.error("Usage: node run.js --job JOB001 [--all] [--data <folder>] [--out <folder>]"); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(dataDir, f), "utf8");
const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "config", "taxonomy.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config", "scoring.json"), "utf8"));
let result;
try {
  result = runFromCsvText({ attendees: read("conference_attendees.csv"), profiles: read("linkedin_profiles.csv"), jobs: read("job_openings.csv"), employees: read("wsc_employees.csv") }, jobId, taxonomy, config);
} catch (e) { console.error("Error: " + e.message); process.exit(1); }

const { pool, job, matches, shortlist } = result, rows = args.includes("--all") ? matches : shortlist;
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, job.job_id + (args.includes("--all") ? "_all_contacts.csv" : "_shortlist.csv"));
fs.writeFileSync(outFile, exportMatches(rows, job));

const s = pool.summary, pad = (t, n) => String(t).padEnd(n).slice(0, n);
console.log("\n" + job.job_id + "  " + job.title + "  (" + job.seniority + ")");
console.log("Talent pool: " + pool.contacts.length + " contacts from " + s.rows + " rows | " + pool.contacts.filter((c) => c.profile).length + " enriched | " + s.corrections + " to correct | " + s.identity_review + " for identity review");
console.log("Shortlist:   " + shortlist.length + " of " + matches.length + " pass the rule (half of required skills covered, plus domain evidence)\n");
console.log(pad("Band", 5) + pad("Score", 7) + pad("Name", 20) + pad("Title", 32) + pad("Req", 5) + pad("To verify", 30) + "Connections");
for (const m of shortlist) {
  const p = m.contact.profile, gaps = m.required.filter((r) => r.level !== "full").map((r) => r.requirement).join(", ") || "-";
  const conn = m.connections.list.length ? m.connections.list.length + " (" + STRENGTH_TEXT[m.connections.list[0].strength] + ")" : "none known";
  console.log(pad(m.band, 5) + pad(m.score.toFixed(1), 7) + pad(m.contact.full_name, 20) + pad(p ? p.current_title : m.contact.title, 32) + pad(m.required_full + "/" + m.required.length, 5) + pad(gaps, 30) + conn);
}
console.log("\nWrote " + rows.length + " rows to " + path.relative(process.cwd(), outFile) + "\n");
