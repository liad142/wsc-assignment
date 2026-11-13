// Plain Node tests, no framework.  Run: node tests/run-tests.js
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const { parseCsv } = require("../src/csv.js");
const { buildTalentPool, matchJob } = require("../src/pipeline.js");
const { exportMatches, OUTPUT_COLUMNS } = require("../src/exporter.js");
const root = path.join(__dirname, ".."), read = (f) => parseCsv(fs.readFileSync(path.join(root, "data", f), "utf8"));
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, "config", "taxonomy.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(root, "config", "scoring.json"), "utf8"));
const attendees = read("conference_attendees.csv"), profiles = read("linkedin_profiles.csv"), jobs = read("job_openings.csv"), employees = read("wsc_employees.csv");
const pool = buildTalentPool(attendees, profiles, config);
const run = (job, p = pool, w) => matchJob(p, jobs, employees, job, taxonomy, config, w);
const find = (r, name) => r.matches.find((m) => m.contact.full_name === name);
const req = (m, name) => m.required.find((x) => x.requirement === name);

const tests = {
  "all 75 attendees become contacts and all are enriched": () => {
    assert.strictEqual(pool.contacts.length, 75); assert.ok(pool.contacts.every((c) => c.enrichment_status === "enriched"));
  },
  "JOB001: Lucas, Chiara and Priya share the top band": () => {
    const top = run("JOB001").shortlist.filter((m) => m.band === 1).map((m) => m.contact.full_name).sort();
    assert.deepStrictEqual(top, ["Chiara Russo", "Lucas Evans", "Priya Anand"]);
  },
  "partial match: YOLO counts in full for Object Detection": () => {
    const r = req(find(run("JOB001"), "Priya Anand"), "Object Detection"); assert.strictEqual(r.level, "full"); assert.strictEqual(r.matched_term, "YOLO");
  },
  "misleading term: Event Detection earns nothing for Object Detection": () => {
    const r = req(find(run("JOB001"), "Marcus Reid"), "Object Detection"); assert.strictEqual(r.credit, 0); assert.ok(/Event Detection/.test(r.question));
  },
  "related term: TensorFlow earns half credit for PyTorch": () => {
    assert.strictEqual(req(find(run("JOB001"), "Mason Young"), "PyTorch").level, "partial");
  },
  "a missing required skill is 'to verify', never a disqualification": () => {
    const m = find(run("JOB001"), "Lucas Evans"); assert.strictEqual(req(m, "Object Detection").level, "to_verify"); assert.ok(m.shortlisted);
  },
  "changing job_id changes the shortlist": () => {
    const a = run("JOB001").shortlist.map((m) => m.contact.full_name), b = run("JOB004").shortlist.map((m) => m.contact.full_name);
    assert.ok(b.includes("Henry Wright") && !a.includes("Henry Wright")); assert.ok(a.includes("Lucas Evans") && !b.includes("Lucas Evans"));
  },
  "unknown job_id fails with a clear message": () => { assert.throws(() => run("JOB999"), /Unknown job_id/); },
  "contact with no matching profile is kept, flagged and still classified": () => {
    const p = buildTalentPool(attendees, profiles.filter((x) => !x.linkedin_url.includes("lucas-evans")), config);
    const c = p.contacts.find((x) => x.full_name === "Lucas Evans");
    assert.strictEqual(p.contacts.length, 75); assert.strictEqual(c.enrichment_status, "profile_not_found");
    assert.ok(c.professional_domains.some((d) => d.domain === "ML / AI"), "classified from badge title");
    const m = find(run("JOB001", p), "Lucas Evans"); assert.ok(m.preliminary); assert.strictEqual(m.connections.status, "unknown");
  },
  "contact with no LinkedIn URL is kept with its own status": () => {
    const rows = attendees.map((a) => (a.full_name === "Mei Zhang" ? Object.assign({}, a, { linkedin_url: "" }) : a));
    const c = buildTalentPool(rows, profiles, config).contacts.find((x) => x.full_name === "Mei Zhang"); assert.strictEqual(c.enrichment_status, "no_profile_url");
  },
  "profile whose name does not match is not attached": () => {
    const prof = profiles.map((x) => (x.linkedin_url.includes("mei-zhang") ? Object.assign({}, x, { full_name: "Someone Else" }) : x));
    const c = buildTalentPool(attendees, prof, config).contacts.find((x) => x.full_name === "Mei Zhang");
    assert.strictEqual(c.enrichment_status, "identity_mismatch"); assert.strictEqual(c.profile, null);
  },
  "no mutual connections is stated, and does not change the score": () => {
    const r = run("JOB004"), m = find(r, "Viktor Novak"); assert.strictEqual(m.connections.status, "none");
    const stripped = profiles.map((x) => Object.assign({}, x, { wsc_mutual_connections: "" }));
    const r2 = run("JOB004", buildTalentPool(attendees, stripped, config));
    assert.deepStrictEqual(r.matches.map((x) => [x.contact.full_name, x.score]).sort(), r2.matches.map((x) => [x.contact.full_name, x.score]).sort());
  },
  "connection strength: Priya and Maya Levi worked together; Lucas has LinkedIn-only links": () => {
    const r = run("JOB001");
    assert.strictEqual(find(r, "Priya Anand").connections.list.find((c) => c.name === "Maya Levi").strength, "worked_together");
    assert.ok(find(r, "Lucas Evans").connections.list.every((c) => c.strength === "linkedin_only"));
  },
  "a connection ID that is not a current employee is never shown": () => {
    const prof = profiles.map((x) => (x.linkedin_url.includes("lucas-evans") ? Object.assign({}, x, { wsc_mutual_connections: "WSC002;WSC999" }) : x));
    const m = find(run("JOB001", buildTalentPool(attendees, prof, config)), "Lucas Evans");
    assert.strictEqual(m.connections.list.length, 1); assert.deepStrictEqual(m.connections.unknown_ids, ["WSC999"]);
  },
  "re-importing the same file creates no duplicates": () => {
    const p = buildTalentPool(attendees.concat(attendees), profiles, config);
    assert.strictEqual(p.contacts.length, 75); assert.ok(p.contacts.every((c) => c.encounters.length === 1));
  },
  "the same person at a second conference gets a second encounter": () => {
    const again = Object.assign({}, attendees[0], { conference_name: "DevOps World 2025", conference_domain: "DevOps & Platform Engineering", conference_date: "2025-04-10" });
    const c = buildTalentPool(attendees.concat([again]), profiles, config).contacts.find((x) => x.full_name === attendees[0].full_name);
    assert.strictEqual(c.encounters.length, 2);
  },
  "unusable row goes to the correction queue; conflicting identifiers go to identity review": () => {
    const bad = { full_name: "", email: "", conference_name: "X" };
    const clash = Object.assign({}, attendees[1], { email: attendees[0].email });
    const p = buildTalentPool(attendees.concat([bad, clash]), profiles, config);
    assert.strictEqual(p.contacts.length, 75); assert.strictEqual(p.corrections.length, 1); assert.strictEqual(p.identityReview.length, 1);
  },
  "the sample conference export produces the documented result, with row numbers from its own file": () => {
    const sample = parseCsv(fs.readFileSync(path.join(root, "data", "samples", "new_conference_export.csv"), "utf8"));
    sample.forEach((r, i) => { r._row_number = i + 2; r._source_file = "new_conference_export.csv"; });
    const p = buildTalentPool(attendees.concat(sample), profiles, config), by = (n) => p.contacts.find((c) => c.full_name === n);
    assert.strictEqual(p.contacts.length, 77); assert.strictEqual(by("Priya Anand").encounters.length, 2);
    assert.strictEqual(by("Dana Example").enrichment_status, "no_profile_url"); assert.ok(by("Dana Example").professional_domains.some((d) => d.domain === "ML / AI"));
    assert.strictEqual(by("Noam Sample").professional_domains[0].domain, "Sales");
    assert.deepStrictEqual(p.corrections.map((x) => x.row_number), [5]); assert.deepStrictEqual(p.identityReview.map((x) => x.row_number), [6]);
  },
  "domain relevance: same DevOps conference, different verdicts": () => {
    const rel = (n) => pool.contacts.find((c) => c.full_name === n).encounters[0].relevance.level;
    assert.strictEqual(rel("Mei Zhang"), "in_domain"); assert.strictEqual(rel("Amara Diallo"), "outside"); assert.strictEqual(rel("Tom Nguyen"), "outside");
  },
  "weights can be changed without touching the shortlist rule": () => {
    const a = run("JOB001").shortlist.map((m) => m.contact.full_name).sort();
    const b = run("JOB001", pool, { required: 20, domains: 20, role_family: 20, seniority: 20, nice_to_have: 20 }).shortlist.map((m) => m.contact.full_name).sort();
    assert.deepStrictEqual(a, b);
  },
  "CSV export has every documented column and one row per shortlisted contact": () => {
    const r = run("JOB001"), rows = parseCsv(exportMatches(r.shortlist, r.job));
    assert.strictEqual(rows.length, r.shortlist.length); assert.deepStrictEqual(Object.keys(rows[0]), OUTPUT_COLUMNS); assert.ok(rows.every((x) => x.hubspot_id && x.email));
  },
};
let failed = 0;
for (const [name, fn] of Object.entries(tests)) { try { fn(); console.log("  ok    " + name); } catch (e) { failed++; console.log("  FAIL  " + name + "\n        " + e.message); } }
console.log("\n" + (Object.keys(tests).length - failed) + " of " + Object.keys(tests).length + " tests passed");
process.exit(failed ? 1 : 0);
