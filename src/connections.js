// Stage 4 - mutual connections. A LinkedIn connection is not proof that two people know each other,
// so each one is graded by shared work history. Connections never change the match score.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else
    root.TalentOps = Object.assign(
      root.TalentOps || {},
      factory(() => root.TalentOps),
    );
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  const { splitList } = load("./csv.js");
  const STRENGTH = {
    WORKED: "worked_together",
    EMPLOYER: "same_employer",
    LINKEDIN: "linkedin_only",
  };
  const RANK = { worked_together: 3, same_employer: 2, linkedin_only: 1 };

  function parseSpans(entries) {
    const spans = [];
    for (const raw of entries) {
      const m = raw.match(/^(.*?)\s*\((\d{4})\s*-\s*(\d{4}|present)/i);
      if (!m) continue;
      const company = m[1].replace(/^.*\bat\s+/i, "").trim();
      spans.push({
        company,
        start: Number(m[2]),
        end: /present/i.test(m[3]) ? 9999 : Number(m[3]),
      });
    }
    return spans;
  }
  function sameCompany(a, b, cfg) {
    const generic = (s) => cfg.generic_employers.some((g) => s.toLowerCase().includes(g));
    if (generic(a) || generic(b)) return false;
    const tokens = (s) =>
      new Set(
        s
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, " ")
          .split(/\s+/)
          .filter((t) => t && !cfg.company_stopwords.includes(t)),
      );
    const ta = tokens(a),
      tb = tokens(b);
    return [...ta].some((t) => tb.has(t));
  }
  function gradeConnection(contact, employee, cfg) {
    const p = contact.profile,
      empSpans = parseSpans(splitList(employee.work_history));
    const candSpans = parseSpans(p.past_titles);
    // The current job has no dates in the data; assume it started when the latest past role ended.
    if (p.current_company && !candSpans.some((s) => s.end === 9999)) {
      const latestEnd = Math.max(0, ...candSpans.map((s) => s.end));
      candSpans.push({
        company: p.current_company,
        start: latestEnd || 0,
        end: 9999,
        inferred: true,
      });
    }
    let best = {
      strength: STRENGTH.LINKEDIN,
      detail: "Connected on LinkedIn; no shared employer found",
    };
    for (const c of candSpans)
      for (const e of empSpans) {
        if (!sameCompany(c.company, e.company, cfg)) continue;
        const from = Math.max(c.start, e.start),
          to = Math.min(c.end, e.end);
        if (from <= to && !c.inferred)
          return {
            strength: STRENGTH.WORKED,
            detail: "Both at " + e.company + " in " + from + (to !== from ? "-" + to : ""),
          };
        if (best.strength === STRENGTH.LINKEDIN)
          best = {
            strength: STRENGTH.EMPLOYER,
            detail: "Both worked at " + e.company + ", overlap not confirmed",
          };
      }
    return best;
  }
  function resolveConnections(contact, employees, cfg) {
    if (!contact.profile)
      return { status: "unknown", list: [], note: "No profile, so connections are unknown" };
    const ids = contact.profile.mutual_connection_ids;
    if (!ids.length) return { status: "none", list: [], note: "No known internal connection" };
    const byId = new Map(employees.map((e) => [e.employee_id, e])),
      list = [],
      unknownIds = [];
    for (const id of ids) {
      const e = byId.get(id);
      if (!e) {
        unknownIds.push(id);
        continue;
      } // left the company, or bad ID: never shown as a reference
      list.push(
        Object.assign(
          { employee_id: id, name: e.full_name, title: e.title, department: e.department },
          gradeConnection(contact, e, cfg),
        ),
      );
    }
    list.sort((a, b) => RANK[b.strength] - RANK[a.strength] || a.name.localeCompare(b.name));
    return {
      status: list.length ? "found" : "none",
      list,
      unknown_ids: unknownIds,
      note: list.length ? "" : "Listed connections are not current employees",
    };
  }
  return { resolveConnections, gradeConnection, parseSpans, CONNECTION_STRENGTH: STRENGTH };
});
