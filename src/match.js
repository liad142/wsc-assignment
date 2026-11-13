// Stages 3 - matching. Compares one person with one job, requirement by requirement, using the term table.
// Every point in the score traces back to a requirement, a matched term and where that term was found.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else { root.TalentOps = root.TalentOps || {}; Object.assign(root.TalentOps, factory(function () { return root.TalentOps; })); }
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  const { evidenceOf } = load("./classify.js");
  const { splitList } = load("./csv.js");

  function parseJob(row) {
    return { job_id: row.job_id, title: row.title, department: row.department, seniority: row.seniority,
      required: splitList(row.required_skills), domains: splitList(row.key_domains), nice_to_have: splitList(row.nice_to_have) };
  }
  // Where else, besides the skills list, does this term show up? A self-reported skill that also
  // appears in a title, a past title or the recruiter's note is better backed than a bare list entry.
  function backing(term, requirement, ev) {
    const needles = [term, requirement].map((t) => t.toLowerCase());
    const where = [];
    if (needles.some((n) => ev.title.includes(n))) where.push("current title");
    if (needles.some((n) => ev.past_titles.includes(n))) where.push("past title");
    if (needles.some((n) => ev.notes.includes(n))) where.push("recruiter note");
    return where;
  }
  function assessRequirement(requirement, rule, ev, credit) {
    const result = { requirement, level: "to_verify", credit: credit.none, matched_term: "", source: "", backed_by: [], question: "No evidence of " + requirement + " in the data we hold" };
    if (!rule) { result.question = "No term-table entry for " + requirement; return result; }
    const skills = new Map(ev.skills.map((s) => [s.toLowerCase(), s]));
    const fromSkills = (terms) => (terms || []).map((t) => skills.get(t.toLowerCase())).find(Boolean);
    const fromText = (spec) => { for (const [field, words] of Object.entries(spec || {})) { const w = words.find((x) => (ev[field] || "").includes(x)); if (w) return { field, word: w }; } return null; };
    const fieldLabel = { title: "current title", notes: "recruiter note", industry: "industry" };

    const fullSkill = fromSkills(rule.full), fullText = fromText(rule.text_full);
    const partSkill = fromSkills(rule.partial), partText = fromText(rule.text_partial);
    if (fullSkill || fullText) {
      Object.assign(result, { level: "full", credit: credit.full, question: "" });
      if (fullSkill) Object.assign(result, { matched_term: fullSkill, source: "skills list", backed_by: backing(fullSkill, requirement, ev) });
      else Object.assign(result, { matched_term: fullText.word, source: fieldLabel[fullText.field], backed_by: [fieldLabel[fullText.field]] });
    } else if (partSkill || partText) {
      Object.assign(result, { level: "partial", credit: credit.partial });
      if (partSkill) Object.assign(result, { matched_term: partSkill, source: "skills list", backed_by: backing(partSkill, requirement, ev) });
      else Object.assign(result, { matched_term: partText.word, source: fieldLabel[partText.field], backed_by: [fieldLabel[partText.field]] });
      result.question = "Related experience (" + result.matched_term + "); ask about hands-on " + requirement;
    } else {
      const misleading = fromSkills(rule.exclude);
      if (misleading) result.question = misleading + " sounds close but is not " + requirement + "; ask directly";
    }
    return result;
  }
  function assessSeniority(job, ev, config) {
    const s = config.seniority, senior = s.senior_title_terms.find((t) => ev.title.includes(t));
    const years = ev.years, known = years != null;
    const out = (credit, note) => ({ credit, note });
    if (job.seniority === "Senior") {
      if (senior) return out(1, "Title carries '" + senior + "'");
      if (known && years >= s.Senior.partial_years) return out(0.5, years + " years of experience, no senior title");
      return out(0, known ? years + " years, no senior title; verify level" : "Seniority unknown; verify");
    }
    if (job.seniority === "Mid-Senior") {
      if (senior || (known && years >= s["Mid-Senior"].full_years)) return out(1, senior ? "Senior title" : years + " years of experience");
      if (known && years >= s["Mid-Senior"].partial_years) return out(0.5, years + " years; slightly junior");
      return out(0, known ? years + " years; junior for this role" : "Seniority unknown; verify");
    }
    if (known && years >= s.Mid.full_years) return out(1, senior ? "May be senior for a mid-level role (" + years + " years)" : years + " years of experience");
    return out(known ? 0.5 : 0, known ? years + " years; junior for this role" : "Seniority unknown; verify");
  }
  function assessRoleFamily(job, ev, config) {
    const fam = config.role_family[job.job_id] || { full: [], partial: [] };
    const cur = fam.full.find((t) => ev.title.includes(t));
    if (cur) return { credit: 1, note: "Current title is in the role family" };
    const near = fam.partial.find((t) => ev.title.includes(t));
    if (near) return { credit: 0.5, note: "Current title is a neighbouring role" };
    const past = fam.full.find((t) => ev.past_titles.includes(t));
    if (past) return { credit: 0.5, note: "Held this kind of role before" };
    return { credit: 0, note: "Different role family" };
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  function matchContact(contact, job, taxonomy, config, weights) {
    const ev = evidenceOf(contact), table = taxonomy[job.job_id] || {}, w = weights || config.weights;
    const assess = (list, group) => list.map((r) => assessRequirement(r, (table[group] || {})[r], ev, config.credit));
    const required = assess(job.required, "required"), domains = assess(job.domains, "domains"), nice = assess(job.nice_to_have, "nice_to_have");
    const seniority = assessSeniority(job, ev, config), family = assessRoleFamily(job, ev, config);
    const coverage = { required: mean(required.map((r) => r.credit)), domains: mean(domains.map((r) => r.credit)), nice_to_have: mean(nice.map((r) => r.credit)) };
    const parts = { required: w.required * coverage.required, domains: w.domains * coverage.domains, role_family: w.role_family * family.credit, seniority: w.seniority * seniority.credit, nice_to_have: w.nice_to_have * coverage.nice_to_have };
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    const score = Math.round((1000 * Object.values(parts).reduce((a, b) => a + b, 0)) / total) / 10;
    const rule = config.shortlist_rule;
    const domainCredit = domains.reduce((a, r) => a + r.credit, 0);
    const shortlisted = coverage.required >= rule.min_required_coverage && domainCredit >= rule.min_domain_credit;
    return { contact, job_id: job.job_id, score, parts, coverage, required, domains, nice_to_have: nice, seniority, role_family: family, shortlisted,
      required_full: required.filter((r) => r.level === "full").length,
      backed_count: required.concat(domains).filter((r) => r.level !== "to_verify" && r.backed_by.length).length,
      preliminary: !ev.from_profile };
  }
  // Scores closer than band_width are a tie for practical purposes: showing them as 1st, 2nd, 3rd would be false precision.
  function rankMatches(matches, config) {
    const byTie = (a, b) => b.coverage.required - a.coverage.required || b.backed_count - a.backed_count || b.score - a.score || a.contact.full_name.localeCompare(b.contact.full_name);
    const short = matches.filter((m) => m.shortlisted).sort((a, b) => b.score - a.score);
    let band = 0, leader = null;
    for (const m of short) { if (leader === null || leader - m.score >= config.band_width) { band++; leader = m.score; } m.band = band; }
    short.sort((a, b) => a.band - b.band || byTie(a, b));
    // Contacts below the line get no band; they stay visible, ordered by score.
    const rest = matches.filter((m) => !m.shortlisted).sort((a, b) => b.score - a.score || byTie(a, b));
    rest.forEach((m) => { m.band = null; });
    return short.concat(rest);
  }
  return { parseJob, matchContact, rankMatches, assessRequirement };
});
