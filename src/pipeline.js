// The pipeline, end to end. buildTalentPool runs once per import; matchJob runs each time a recruiter picks a job.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else { root.TalentOps = root.TalentOps || {}; Object.assign(root.TalentOps, factory(function () { return root.TalentOps; })); }
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  const { parseCsv } = load("./csv.js");
  const { ingestAttendees } = load("./ingest.js");
  const { enrichAll } = load("./enrich.js");
  const { classifyAll } = load("./classify.js");
  const { parseJob, matchContact, rankMatches } = load("./match.js");
  const { resolveConnections } = load("./connections.js");

  // Stages 1-2: attendees + profiles -> a searchable pool where everyone is kept.
  function buildTalentPool(attendeeRows, profileRows, config) {
    const ingested = ingestAttendees(attendeeRows);
    const contacts = classifyAll(enrichAll(ingested.contacts, profileRows), config);
    return { contacts, corrections: ingested.corrections, identityReview: ingested.identityReview, summary: ingested.summary };
  }
  // Stages 3-4: pool + job_id -> ranked matches with evidence and graded connections.
  function matchJob(pool, jobRows, employeeRows, jobId, taxonomy, config, weights) {
    const row = jobRows.find((j) => j.job_id === jobId);
    if (!row) throw new Error("Unknown job_id '" + jobId + "'. Available: " + jobRows.map((j) => j.job_id).join(", "));
    const job = parseJob(row);
    if (!job.required.length) throw new Error("Job " + jobId + " has no required skills, so there is nothing to match against");
    const matches = pool.contacts.map((c) => {
      const m = matchContact(c, job, taxonomy, config, weights);
      m.connections = resolveConnections(c, employeeRows, config.connections);
      return m;
    });
    const ranked = rankMatches(matches, config);
    return { job, matches: ranked, shortlist: ranked.filter((m) => m.shortlisted) };
  }
  function runFromCsvText(texts, jobId, taxonomy, config, weights) {
    const pool = buildTalentPool(parseCsv(texts.attendees), parseCsv(texts.profiles), config);
    return Object.assign({ pool }, matchJob(pool, parseCsv(texts.jobs), parseCsv(texts.employees), jobId, taxonomy, config, weights));
  }
  return { buildTalentPool, matchJob, runFromCsvText };
});
