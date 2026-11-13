// Output. One row per contact and job, flat and HubSpot-ready: hubspot_id and email identify the record.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else
    root.TalentOps = Object.assign(
      root.TalentOps || {},
      factory(() => root.TalentOps),
    );
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  const { toCsv } = load("./csv.js");
  const COLUMNS = [
    "hubspot_id",
    "email",
    "full_name",
    "current_title",
    "current_company",
    "job_id",
    "job_title",
    "shortlisted",
    "priority_band",
    "match_score",
    "required_coverage",
    "required_met",
    "required_partial",
    "required_to_verify",
    "domain_evidence",
    "role_family_fit",
    "seniority_fit",
    "nice_to_have_met",
    "professional_domains",
    "met_at",
    "conference_relevance",
    "enrichment_status",
    "connection_count",
    "strongest_connection",
    "internal_connections",
    "ats_status",
    "consent_basis",
    "recruiter_notes",
    "why_this_person",
    "next_step",
    "linkedin_url",
  ];
  const STRENGTH_TEXT = {
    worked_together: "worked together",
    same_employer: "same employer",
    linkedin_only: "LinkedIn only",
  };
  const describe = (r) =>
    r.requirement +
    (r.matched_term && r.matched_term.toLowerCase() !== r.requirement.toLowerCase()
      ? " (via " + r.matched_term + ")"
      : "");

  function nextStep(m) {
    const strong = m.connections.list.find((c) => c.strength === "worked_together");
    const gaps = m.required.filter((r) => r.level !== "full").map((r) => r.requirement);
    const ask = gaps.length ? " Verify: " + gaps.join(", ") + "." : "";
    if (m.preliminary)
      return (
        "Complete the LinkedIn profile before outreach; this assessment uses event details only." +
        ask
      );
    if (strong)
      return (
        "Ask " +
        strong.name +
        " (" +
        strong.detail.charAt(0).toLowerCase() +
        strong.detail.slice(1) +
        ") about their work together, then reach out." +
        ask
      );
    if (m.connections.list.length)
      return (
        "Ask " +
        m.connections.list[0].name +
        " whether they actually know this person before using them as a reference." +
        ask
      );
    return "Direct outreach; no known internal connection." + ask;
  }
  function whyThisPerson(m) {
    const full = m.required.filter((r) => r.level === "full").length,
      dom = m.domains.filter((r) => r.level !== "to_verify").map(describe);
    return (
      full +
      " of " +
      m.required.length +
      " required skills documented" +
      (dom.length ? "; domain evidence: " + dom.join(", ") : "; no domain evidence")
    );
  }
  function toRecord(m, job) {
    const c = m.contact,
      p = c.profile,
      last = c.encounters[c.encounters.length - 1];
    const pick = (list, level) =>
      list
        .filter((r) => r.level === level)
        .map(describe)
        .join("; ");
    return {
      hubspot_id: c.hubspot_id,
      email: c.email,
      full_name: c.full_name,
      current_title: p ? p.current_title : c.title,
      current_company: p ? p.current_company : c.company,
      job_id: job.job_id,
      job_title: job.title,
      shortlisted: m.shortlisted ? "yes" : "no",
      priority_band: m.band == null ? "" : m.band,
      match_score: m.score.toFixed(1),
      required_coverage: m.required_full + " of " + m.required.length,
      required_met: pick(m.required, "full"),
      required_partial: pick(m.required, "partial"),
      required_to_verify: pick(m.required, "to_verify"),
      domain_evidence: m.domains
        .filter((r) => r.level !== "to_verify")
        .map(describe)
        .join("; "),
      role_family_fit: m.role_family.note,
      seniority_fit: m.seniority.note,
      nice_to_have_met: m.nice_to_have
        .filter((r) => r.level !== "to_verify")
        .map(describe)
        .join("; "),
      professional_domains: c.professional_domains.map((d) => d.domain).join("; ") || "Unknown",
      met_at: c.encounters
        .map((e) => e.conference_name + " (" + e.conference_date + ")")
        .join("; "),
      conference_relevance: last ? last.relevance.level : "unknown",
      enrichment_status: c.enrichment_status,
      connection_count: m.connections.list.length,
      strongest_connection: m.connections.list.length
        ? STRENGTH_TEXT[m.connections.list[0].strength]
        : m.connections.status === "unknown"
          ? "unknown"
          : "none",
      internal_connections:
        m.connections.list
          .map(
            (x) =>
              x.name + " - " + x.title + " [" + STRENGTH_TEXT[x.strength] + ": " + x.detail + "]",
          )
          .join("; ") || m.connections.note,
      ats_status: "unknown (no Comeet data in this exercise)",
      consent_basis: "not recorded (simulated data)",
      recruiter_notes: c.encounters
        .map((e) => e.notes)
        .filter(Boolean)
        .join("; "),
      why_this_person: whyThisPerson(m),
      next_step: nextStep(m),
      linkedin_url: c.linkedin_url,
    };
  }
  function exportMatches(matches, job) {
    return toCsv(
      COLUMNS,
      matches.map((m) => toRecord(m, job)),
    );
  }
  return {
    exportMatches,
    toRecord,
    nextStep,
    whyThisPerson,
    OUTPUT_COLUMNS: COLUMNS,
    STRENGTH_TEXT,
  };
});
