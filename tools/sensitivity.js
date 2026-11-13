// How much do the weights matter? Compares the default weights with six alternatives, for every job.
// Run: node tools/sensitivity.js
"use strict";
const fs = require("fs"),
  path = require("path"),
  root = path.join(__dirname, "..");
const { parseCsv } = require("../src/csv.js"),
  { buildTalentPool, matchJob } = require("../src/pipeline.js");
const read = (f) => parseCsv(fs.readFileSync(path.join(root, "data", f), "utf8")),
  json = (f) => JSON.parse(fs.readFileSync(path.join(root, "config", f), "utf8"));
const config = json("scoring.json"),
  taxonomy = json("taxonomy.json"),
  jobs = read("job_openings.csv"),
  employees = read("wsc_employees.csv");
const pool = buildTalentPool(
  read("conference_attendees.csv"),
  read("linkedin_profiles.csv"),
  config,
);
const W = (required, domains, role_family, seniority, nice_to_have) => ({
  required,
  domains,
  role_family,
  seniority,
  nice_to_have,
});
const schemes = {
  "equal 20x5": W(20, 20, 20, 20, 20),
  "70/30/0/0/0": W(70, 30, 0, 0, 0),
  "50/30/10/5/5": W(50, 30, 10, 5, 5),
  "80/10/0/5/5": W(80, 10, 0, 5, 5),
  "45/35/10/5/5": W(45, 35, 10, 5, 5),
  "40/40/10/5/5": W(40, 40, 10, 5, 5),
};
const top = (jobId, w, n) =>
  matchJob(pool, jobs, employees, jobId, taxonomy, config, w)
    .matches.slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((m) => m.contact.full_name);
console.log("Overlap with the default weights (60/25/5/5/5): top 10 and top 3\n");
console.log("scheme".padEnd(16) + jobs.map((j) => j.job_id.padEnd(14)).join(""));
let min10 = 10;
for (const [name, w] of Object.entries(schemes)) {
  console.log(
    name.padEnd(16) +
      jobs
        .map((j) => {
          const a = top(j.job_id, undefined, 10),
            b = top(j.job_id, w, 10),
            o10 = a.filter((x) => b.includes(x)).length,
            o3 = a.slice(0, 3).filter((x) => b.slice(0, 3).includes(x)).length;
          min10 = Math.min(min10, o10);
          return (o10 + "/10, " + o3 + "/3").padEnd(14);
        })
        .join(""),
  );
}
console.log("\nLowest top-10 overlap across all schemes and jobs: " + min10 + "/10");
