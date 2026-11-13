// How long does matching take as the pool grows? Repeats the 75 sample contacts to build larger pools.
// Run: node tools/benchmark.js
"use strict";
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../src/csv.js");
const { buildTalentPool, matchJob } = require("../src/pipeline.js");

const root = path.join(__dirname, "..");
const read = (file) => parseCsv(fs.readFileSync(path.join(root, "data", file), "utf8"));
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, "config", file), "utf8"));
const config = json("scoring.json");
const taxonomy = json("taxonomy.json");
const attendees = read("conference_attendees.csv");
const profiles = read("linkedin_profiles.csv");
const jobs = read("job_openings.csv");
const employees = read("wsc_employees.csv");

// Copy every contact n times with unique identifiers, so each copy is a separate person.
function grow(times) {
  const people = [];
  const pages = [];
  for (let i = 0; i < times; i++) {
    for (const a of attendees) {
      const url = a.linkedin_url + "-" + i;
      people.push({
        ...a,
        hubspot_id: a.hubspot_id + "-" + i,
        email: i + "." + a.email,
        linkedin_url: url,
      });
    }
    for (const p of profiles) pages.push({ ...p, linkedin_url: p.linkedin_url + "-" + i });
  }
  return { people, pages };
}
const ms = (start) =>
  (Number(process.hrtime.bigint() - start) / 1e6).toFixed(0).padStart(6) + " ms";

console.log("\nContacts   Build pool   Match one role");
for (const times of [1, 14, 134, 1334]) {
  const { people, pages } = grow(times);
  let start = process.hrtime.bigint();
  const pool = buildTalentPool(people, pages, config);
  const build = ms(start);
  start = process.hrtime.bigint();
  matchJob(pool, jobs, employees, "JOB001", taxonomy, config);
  console.log(String(pool.contacts.length).padStart(8) + "   " + build + "    " + ms(start));
}
console.log(
  "\nSingle process, no database. Matching is a query over the pool, not a rebuild of it.\n",
);
