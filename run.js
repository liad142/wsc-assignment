#!/usr/bin/env node
// Command-line entry point.
// Usage: node run.js --job JOB001 [--all] [--data <folder>] [--out <folder>]
"use strict";
const fs = require("fs");
const path = require("path");
const { runFromCsvText } = require("./src/pipeline.js");
const { exportMatches, STRENGTH_TEXT } = require("./src/exporter.js");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const jobId = option("job");
const dataDir = option("data", path.join(__dirname, "data"));
const outDir = option("out", path.join(__dirname, "output"));
const exportAll = args.includes("--all");

if (!jobId) {
  console.error("Usage: node run.js --job JOB001 [--all] [--data <folder>] [--out <folder>]");
  process.exit(1);
}

const readData = (file) => fs.readFileSync(path.join(dataDir, file), "utf8");
const readConfig = (file) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "config", file), "utf8"));

let result;
try {
  const csv = {
    attendees: readData("conference_attendees.csv"),
    profiles: readData("linkedin_profiles.csv"),
    jobs: readData("job_openings.csv"),
    employees: readData("wsc_employees.csv"),
  };
  result = runFromCsvText(csv, jobId, readConfig("taxonomy.json"), readConfig("scoring.json"));
} catch (error) {
  console.error("Error: " + error.message);
  process.exit(1);
}

const { pool, job, matches, shortlist } = result;
const rows = exportAll ? matches : shortlist;
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(
  outDir,
  job.job_id + (exportAll ? "_all_contacts.csv" : "_shortlist.csv"),
);
fs.writeFileSync(outFile, exportMatches(rows, job));

// Fixed-width cell: cut long text with an ellipsis and always leave a space before the next column.
const cell = (text, width) => {
  const t = String(text);
  return (t.length > width - 1 ? t.slice(0, width - 2) + "…" : t).padEnd(width);
};
const titleOf = (m) => (m.contact.profile ? m.contact.profile.current_title : m.contact.title);
const gapsOf = (m) =>
  m.required
    .filter((r) => r.level !== "full")
    .map((r) => r.requirement)
    .join(", ") || "-";
const connectionsOf = (m) => {
  const list = m.connections.list;
  return list.length ? list.length + " (" + STRENGTH_TEXT[list[0].strength] + ")" : "none known";
};
const line = (m, first) =>
  cell(first, 6) +
  cell(m.score.toFixed(1), 7) +
  cell(m.contact.full_name, 20) +
  cell(titleOf(m), 33) +
  cell(m.required_full + " of " + m.required.length, 8) +
  cell(gapsOf(m), 40) +
  connectionsOf(m);

const summary = pool.summary;
const enriched = pool.contacts.filter((c) => c.profile).length;
console.log("\n" + job.job_id + "  " + job.title + "  (" + job.seniority + ")");
console.log(
  "Talent pool: " +
    pool.contacts.length +
    " contacts from " +
    summary.rows +
    " rows | " +
    enriched +
    " enriched | " +
    summary.corrections +
    " to correct | " +
    summary.identity_review +
    " for identity review",
);
console.log(
  "Shortlist:   " +
    shortlist.length +
    " of " +
    matches.length +
    " pass the rule (half of the required skills covered, plus evidence for a key domain)\n",
);
console.log(
  cell("Band", 6) +
    cell("Score", 7) +
    cell("Name", 20) +
    cell("Title", 33) +
    cell("Req", 8) +
    cell("Ask about", 40) +
    "WSC connections",
);
for (const m of shortlist) console.log(line(m, m.band));

// The three contacts closest to the line, so the recruiter sees who was left out and why.
const nearMisses = matches.filter((m) => !m.shortlisted).slice(0, 3);
if (nearMisses.length) {
  console.log("\nJust below the line (kept in the pool, not shortlisted):");
  for (const m of nearMisses) console.log(line(m, "-"));
}
console.log("\nWrote " + rows.length + " rows to " + path.relative(process.cwd(), outFile) + "\n");
