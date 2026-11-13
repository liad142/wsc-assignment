// Recruiter view. Display only: every number shown here comes from the same engine the command line uses.
(function () {
  "use strict";
  const T = window.TalentOps,
    D = window.TALENTOPS_DATA,
    $ = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const jobs = T.parseCsv(D.jobs),
    employees = T.parseCsv(D.employees);
  const LEVEL = { full: "Documented", partial: "Related", to_verify: "To verify" };
  const REL = {
    in_domain: "In domain",
    adjacent: "Adjacent",
    outside: "Outside",
    unknown: "Unknown",
  };
  const WEIGHT_LABEL = {
    required: "Required skills",
    domains: "Key domains",
    role_family: "Role family",
    seniority: "Seniority",
    nice_to_have: "Nice to have",
  };
  const state = {
    view: "matches",
    jobId: "JOB001",
    weights: Object.assign({}, D.config.weights),
    selected: null,
    search: "",
    conn: "any",
    attendees: T.parseCsv(D.attendees),
    profiles: T.parseCsv(D.profiles),
    imported: null,
    pf: { conference: "all", domain: "all", relevance: "all", q: "" },
    csv: "",
  };
  let pool, result;

  const counts = {};
  function compute() {
    pool = T.buildTalentPool(state.attendees, state.profiles, D.config);
    jobs.forEach((j) => {
      counts[j.job_id] = T.matchJob(
        pool,
        jobs,
        employees,
        j.job_id,
        D.taxonomy,
        D.config,
      ).shortlist.length;
    });
    result = T.matchJob(pool, jobs, employees, state.jobId, D.taxonomy, D.config, state.weights);
    if (!result.matches.some((m) => m.contact.contact_id === state.selected))
      state.selected =
        (result.shortlist[0] || result.matches[0] || { contact: {} }).contact.contact_id || null;
  }
  const titleOf = (c) => (c.profile ? c.profile.current_title : c.title),
    companyOf = (c) => (c.profile ? c.profile.current_company : c.company);
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), 3200);
  }

  // ---------- Role matches ----------
  function visible(m) {
    const q = state.search.trim().toLowerCase(),
      c = m.contact;
    if (
      q &&
      !(
        c.full_name +
        " " +
        titleOf(c) +
        " " +
        companyOf(c) +
        " " +
        (c.profile ? c.profile.skills.join(" ") : "")
      )
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (
      state.conn === "worked" &&
      !m.connections.list.some((x) => x.strength === "worked_together")
    )
      return false;
    if (state.conn === "any_conn" && !m.connections.list.length) return false;
    return true;
  }
  function rowHtml(m) {
    const c = m.contact,
      top = m.connections.list[0];
    const strip = m.required
      .map(
        (r) =>
          '<span class="seg ' +
          r.level +
          '" title="' +
          esc(
            r.requirement +
              ": " +
              LEVEL[r.level] +
              (r.matched_term ? " (" + r.matched_term + ")" : ""),
          ) +
          '">' +
          esc(r.requirement) +
          "</span>",
      )
      .join("");
    const conn = top
      ? '<span class="pill ' +
        top.strength +
        '">' +
        esc(
          top.strength === "worked_together"
            ? "Worked with " + top.name.split(" ")[0]
            : top.strength === "same_employer"
              ? "Shared employer"
              : m.connections.list.length + " on LinkedIn",
        ) +
        "</span>"
      : '<span class="pill none">' +
        (m.connections.status === "unknown" ? "Connections unknown" : "No connection") +
        "</span>";
    return (
      '<button class="row" data-id="' +
      esc(c.contact_id) +
      '" aria-current="' +
      (c.contact_id === state.selected) +
      '">' +
      '<span class="score">' +
      m.score.toFixed(1) +
      "</span>" +
      '<span class="who"><b>' +
      esc(c.full_name) +
      "</b> <span>" +
      esc(titleOf(c)) +
      ", " +
      esc(companyOf(c)) +
      (m.preliminary ? " (preliminary)" : "") +
      "</span></span>" +
      '<span class="right">' +
      conn +
      "</span>" +
      '<span class="strip" aria-label="' +
      m.required_full +
      " of " +
      m.required.length +
      ' required skills documented">' +
      strip +
      "</span></button>"
    );
  }
  function matchesHtml() {
    const job = result.job,
      short = result.shortlist.filter(visible),
      below = result.matches.filter((m) => !m.shortlisted).filter(visible);
    const bands = new Map();
    short.forEach((m) => {
      if (!bands.has(m.band)) bands.set(m.band, []);
      bands.get(m.band).push(m);
    });
    const total = Object.values(state.weights).reduce((a, b) => a + b, 0) || 1;
    const changed = Object.keys(state.weights).some(
      (k) => state.weights[k] !== D.config.weights[k],
    );
    const topCount = result.shortlist.filter((m) => m.band === 1).length,
      worked = result.shortlist.filter((m) =>
        m.connections.list.some((x) => x.strength === "worked_together"),
      ).length;
    const chips = (xs) => xs.map((x) => '<span class="chip">' + esc(x) + "</span>").join("");
    const bandHtml = [...bands.entries()]
      .map(([bandNo, ms]) => {
        const lo = Math.min(...ms.map((m) => m.score)),
          hi = Math.max(...ms.map((m) => m.score));
        return (
          '<section class="band"><h2>Priority band ' +
          bandNo +
          " <small>" +
          (ms.length > 1
            ? ms.length +
              " people within " +
              D.config.band_width +
              " points of each other, so treat them as a tie"
            : "score " + hi.toFixed(1)) +
          "</small></h2>" +
          ms.map(rowHtml).join("") +
          "</section>"
        );
      })
      .join("");
    return (
      '<div class="grid"><div>' +
      '<div class="jobcard"><h1>' +
      esc(job.title) +
      '</h1><div class="meta">' +
      esc(job.department) +
      ", " +
      esc(job.seniority.toLowerCase()) +
      " level, " +
      esc(job.job_id) +
      "</div>" +
      '<p class="lede"><b>' +
      result.shortlist.length +
      " of " +
      pool.contacts.length +
      "</b> people we met fit this role. " +
      (topCount > 1
        ? "<b>" + topCount + "</b> are effectively tied at the top"
        : "One stands clear at the top") +
      (worked
        ? ", and <b>" +
          worked +
          "</b> " +
          (worked === 1 ? "has" : "have") +
          " worked alongside someone at WSC."
        : ".") +
      "</p>" +
      '<dl class="reqs"><dt>Required</dt><dd>' +
      chips(job.required) +
      "</dd><dt>Key domains</dt><dd>" +
      chips(job.domains) +
      "</dd><dt>Nice to have</dt><dd>" +
      chips(job.nice_to_have) +
      "</dd></dl></div>" +
      '<div class="controls"><input type="search" id="q" placeholder="Search name, title, company or skill" value="' +
      esc(state.search) +
      '" aria-label="Search matches">' +
      '<select id="conn" aria-label="Filter by connection"><option value="any">Everyone</option><option value="any_conn">Connected to someone at WSC</option><option value="worked">Worked with someone at WSC</option></select>' +
      '<button class="btn primary" id="export">Export shortlist CSV</button><button class="btn" id="copy">Copy CSV</button></div>' +
      '<details class="weights"' +
      (changed ? " open" : "") +
      "><summary>Adjust the scoring weights" +
      (changed ? " (changed)" : "") +
      '</summary><div class="wgrid">' +
      Object.keys(state.weights)
        .map(
          (k) =>
            '<label for="w-' +
            k +
            '">' +
            WEIGHT_LABEL[k] +
            '</label><input type="range" id="w-' +
            k +
            '" data-w="' +
            k +
            '" min="0" max="100" step="5" value="' +
            state.weights[k] +
            '"><output>' +
            Math.round((100 * state.weights[k]) / total) +
            "%</output>",
        )
        .join("") +
      '</div><div class="wnote"><span>Weights change the order. Who is shortlisted depends on evidence, not weights: at least half of the required skills covered, plus evidence for one key domain.</span><button class="btn" id="reset">Reset to 60 / 25 / 5 / 5 / 5</button></div></details>' +
      (state.csv
        ? '<textarea class="csv" id="csvbox" readonly aria-label="Shortlist CSV">' +
          esc(state.csv) +
          "</textarea>"
        : "") +
      (short.length
        ? '<div class="legend"><span class="seg full">documented</span><span class="seg partial">related experience</span><span class="seg to_verify">ask in the first call</span></div>' +
          bandHtml
        : '<div class="card pad" style="margin-top:18px"><b>No one matches these filters.</b><p class="muted">The shortlist for this role has ' +
          result.shortlist.length +
          " contacts. Everyone else stays in the pool for future roles.</p></div>") +
      '<details class="below"><summary>Below the line: ' +
      below.length +
      " contacts who do not meet the shortlist rule</summary>" +
      below.slice(0, 80).map(rowHtml).join("") +
      "</details>" +
      "</div><aside>" +
      detailHtml() +
      "</aside></div>"
    );
  }
  function evRows(list) {
    return list
      .map(
        (r) =>
          '<tr><td><span class="pill ' +
          r.level +
          '">' +
          LEVEL[r.level] +
          "</span></td><td>" +
          esc(r.requirement) +
          '</td><td class="why">' +
          (r.level === "to_verify"
            ? esc(r.question)
            : "<b>" +
              esc(r.matched_term) +
              "</b> in " +
              esc(r.source) +
              (r.source === "skills list"
                ? r.backed_by.length
                  ? "; also backed by " + esc(r.backed_by.join(" and "))
                  : "; self-reported only"
                : "") +
              (r.level === "partial" ? ". " + esc(r.question) : "")) +
          "</td></tr>",
      )
      .join("");
  }
  function detailHtml() {
    const m = result.matches.find((x) => x.contact.contact_id === state.selected);
    if (!m)
      return '<div class="detail"><div class="pad muted">Pick someone from the list to see the evidence.</div></div>';
    const c = m.contact,
      p = c.profile,
      w = state.weights;
    const keys = Object.keys(w),
      wsum = keys.reduce((a, k) => a + w[k], 0) || 1,
      SW = ["var(--c0)", "var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];
    const bars =
      '<div class="stack" role="img" aria-label="Score breakdown">' +
      keys
        .map(
          (k, i) => '<i class="s' + i + '" style="width:' + (100 * m.parts[k]) / wsum + '%"></i>',
        )
        .join("") +
      '</div><div class="parts">' +
      keys
        .map(
          (k, i) =>
            '<span><u style="background:' +
            SW[i] +
            '"></u>' +
            WEIGHT_LABEL[k] +
            "<em>" +
            m.parts[k].toFixed(1) +
            " of " +
            w[k] +
            "</em></span>",
        )
        .join("") +
      "</div>";
    const conns = m.connections.list.length
      ? m.connections.list
          .map(
            (x) =>
              '<div class="conn"><span class="av" aria-hidden="true">' +
              esc(
                x.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2),
              ) +
              "</span><b>" +
              esc(x.name) +
              ", " +
              esc(x.title) +
              '</b><span class="pill ' +
              x.strength +
              '">' +
              esc(T.STRENGTH_TEXT[x.strength]) +
              '</span><span class="d">' +
              esc(x.detail) +
              "</span></div>",
          )
          .join("")
      : '<p class="muted">' + esc(m.connections.note) + ". This does not affect the score.</p>";
    const met = c.encounters
      .map(
        (e) =>
          '<dl class="kv"><dt>Conference</dt><dd>' +
          esc(e.conference_name) +
          ", " +
          esc(e.conference_date) +
          "</dd><dt>Captured by</dt><dd>" +
          esc(e.source || "not recorded") +
          '</dd><dt>Domain relevance</dt><dd><span class="pill ' +
          e.relevance.level +
          '">' +
          REL[e.relevance.level] +
          "</span> " +
          esc(e.relevance.reason) +
          "</dd>" +
          (e.notes ? "<dt>Recruiter note</dt><dd>" + esc(e.notes) + "</dd>" : "") +
          "</dl>",
      )
      .join('<hr class="sep">');
    return (
      '<div class="detail"><div class="pad"><div class="head"><div><h2>' +
      esc(c.full_name) +
      '</h2><div class="muted">' +
      esc(titleOf(c)) +
      " at " +
      esc(companyOf(c)) +
      (p && p.location ? ", " + esc(p.location) : "") +
      "</div></div>" +
      '<div class="big">' +
      m.score.toFixed(1) +
      "<small>" +
      (m.shortlisted ? "priority band " + m.band : "below the line") +
      "</small></div></div>" +
      '<p style="margin-top:10px">' +
      esc(T.whyThisPerson(m)) +
      (m.preliminary ? ' <span class="pill partial">preliminary: no LinkedIn profile</span>' : "") +
      "</p>" +
      '<div class="next"><b>Suggested next step</b>' +
      esc(T.nextStep(m)) +
      "</div></div>" +
      '<div class="sec"><h3>Required skills<small>' +
      m.required_full +
      " of " +
      m.required.length +
      ' documented</small></h3><table class="ev">' +
      evRows(m.required) +
      "</table></div>" +
      '<div class="sec"><h3>Key domains</h3><table class="ev">' +
      evRows(m.domains) +
      "</table></div>" +
      '<div class="sec"><h3>Nice to have</h3><table class="ev">' +
      evRows(m.nice_to_have) +
      "</table></div>" +
      '<div class="sec"><h3>Role and seniority</h3><dl class="kv"><dt>Role family</dt><dd>' +
      esc(m.role_family.note) +
      "</dd><dt>Seniority</dt><dd>" +
      esc(m.seniority.note) +
      "</dd></dl></div>" +
      '<div class="sec"><h3>How the score adds up</h3>' +
      bars +
      '<p class="muted small" style="margin-top:10px">The score is documented coverage of this job\'s requirements. It is not a prediction of success.</p></div>' +
      '<div class="sec"><h3>People at WSC<small>never part of the score</small></h3>' +
      conns +
      "</div>" +
      '<div class="sec"><h3>Where we met</h3>' +
      met +
      "</div>" +
      '<div class="sec"><h3>Profile</h3><dl class="kv"><dt>Enrichment</dt><dd>' +
      esc(c.enrichment_status.replace(/_/g, " ")) +
      (c.enrichment_note ? ". " + esc(c.enrichment_note) : "") +
      "</dd><dt>Works in</dt><dd>" +
      esc(c.professional_domains.map((d) => d.domain).join(", ") || "Unknown") +
      "</dd>" +
      (p
        ? "<dt>Skills</dt><dd>" +
          p.skills.map((s) => '<span class="chip">' + esc(s) + "</span>").join(" ") +
          "</dd><dt>Experience</dt><dd>" +
          esc(p.years_experience) +
          " years, " +
          esc(p.industry) +
          "</dd><dt>Before</dt><dd>" +
          esc(p.past_titles.join("; ")) +
          "</dd>"
        : "") +
      "<dt>ATS status</dt><dd>Unknown (no Comeet data in this exercise)</dd></dl></div></div>"
    );
  }

  // ---------- Talent pool ----------
  function poolHtml() {
    const f = state.pf,
      confs = [
        ...new Set(pool.contacts.flatMap((c) => c.encounters.map((e) => e.conference_name))),
      ],
      doms = [
        ...new Set(pool.contacts.flatMap((c) => c.professional_domains.map((d) => d.domain))),
      ].sort();
    const rows = pool.contacts.filter((c) => {
      const e = c.encounters[c.encounters.length - 1];
      if (f.conference !== "all" && !c.encounters.some((x) => x.conference_name === f.conference))
        return false;
      if (f.domain !== "all" && !c.professional_domains.some((d) => d.domain === f.domain))
        return false;
      if (f.relevance !== "all" && e.relevance.level !== f.relevance) return false;
      return (
        !f.q ||
        (c.full_name + " " + titleOf(c) + " " + companyOf(c))
          .toLowerCase()
          .includes(f.q.toLowerCase())
      );
    });
    const opt = (v, l, cur) =>
      '<option value="' +
      esc(v) +
      '"' +
      (v === cur ? " selected" : "") +
      ">" +
      esc(l) +
      "</option>";
    const s = pool.summary,
      im = state.imported;
    const at = (x) => (x.source_file ? x.source_file + ", row " : "Row ") + x.row_number;
    const issues = pool.corrections
      .map(
        (x) =>
          at(x) + ": " + x.reason.replace("Missing", "missing") + ". Kept in the correction queue.",
      )
      .concat(
        pool.identityReview.map(
          (x) =>
            at(x) +
            " (" +
            (x.row.full_name || "unnamed") +
            "): " +
            x.reason.charAt(0).toLowerCase() +
            x.reason.slice(1) +
            ". Held for identity review.",
        ),
      );
    const n = (k, one, many) => k + " " + (k === 1 ? one : many);
    return (
      '<div class="pagehead"><h1>Talent pool</h1><p><b style="color:var(--ink)">' +
      pool.contacts.length +
      " people</b> from " +
      confs.length +
      " conferences, " +
      pool.contacts.filter((c) => c.profile).length +
      " with a LinkedIn profile attached" +
      (pool.contacts.some((c) => !c.profile)
        ? " and " + pool.contacts.filter((c) => !c.profile).length + " kept on badge details alone"
        : "") +
      ". Everyone stays: someone outside one conference's field can be exactly right for a later role.</p></div>" +
      '<div class="controls"><input type="search" id="pq" placeholder="Search the pool" value="' +
      esc(f.q) +
      '" aria-label="Search the pool">' +
      '<select id="p-conf" aria-label="Conference">' +
      opt("all", "All conferences", f.conference) +
      confs.map((c) => opt(c, c, f.conference)).join("") +
      "</select>" +
      '<select id="p-dom" aria-label="Professional domain">' +
      opt("all", "All professional domains", f.domain) +
      doms.map((d) => opt(d, d, f.domain)).join("") +
      "</select>" +
      '<select id="p-rel" aria-label="Relevance">' +
      opt("all", "Any relevance", f.relevance) +
      Object.keys(REL)
        .map((k) => opt(k, REL[k] + " for the conference", f.relevance))
        .join("") +
      "</select>" +
      '<span class="muted">' +
      rows.length +
      " of " +
      pool.contacts.length +
      "</span></div>" +
      '<div class="card tablewrap"><table class="pool"><thead><tr><th>Name</th><th>Role</th><th>Works in</th><th>Met at</th><th>Relevance to that conference</th><th>Enrichment</th></tr></thead><tbody>' +
      rows
        .map((c) => {
          const e = c.encounters[c.encounters.length - 1];
          return (
            "<tr><td><b>" +
            esc(c.full_name) +
            "</b></td><td>" +
            esc(titleOf(c)) +
            '<div class="muted small">' +
            esc(companyOf(c)) +
            "</div></td><td>" +
            esc(c.professional_domains.map((d) => d.domain).join(", ") || "Unknown") +
            "</td><td>" +
            esc(c.encounters.map((x) => x.conference_name).join("; ")) +
            '</td><td><span class="pill ' +
            e.relevance.level +
            '">' +
            REL[e.relevance.level] +
            '</span><div class="muted small">' +
            esc(e.relevance.reason) +
            "</div></td><td>" +
            esc(c.enrichment_status.replace(/_/g, " ")) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>" +
      '<div class="card pad importbox"><h3>Add a conference export</h3><p class="muted small">Same columns as conference_attendees.csv. Profiles are optional: people without one are kept and classified from their badge details. Try data/samples/new_conference_export.csv.</p>' +
      '<div class="import"><div><label for="f-att">Attendees CSV</label><input type="file" id="f-att" accept=".csv,text/csv"></div><div><label for="f-prof">LinkedIn profiles CSV (optional)</label><input type="file" id="f-prof" accept=".csv,text/csv"></div><div><button class="btn primary" id="do-import">Add to the pool</button> <button class="btn" id="undo-import">Reset to provided data</button></div></div>' +
      (im
        ? '<div class="notice"><b>Import finished.</b> ' +
          n(im.rows, "row", "rows") +
          " read: " +
          n(im.created, "new contact", "new contacts") +
          ", " +
          n(im.updated, "existing contact", "existing contacts") +
          " updated, " +
          n(im.encounters, "encounter", "encounters") +
          " added, " +
          n(im.held, "row", "rows") +
          " held for review.</div>"
        : "") +
      (issues.length
        ? '<div class="notice"><b>Rows that need a person to look at them</b><ul>' +
          issues.map((x) => "<li>" + esc(x) + "</li>").join("") +
          "</ul></div>"
        : "") +
      "</div>"
    );
  }

  // ---------- How it works ----------
  function howHtml() {
    const tx = D.taxonomy[state.jobId],
      G = { required: "Required skills", domains: "Key domains", nice_to_have: "Nice to have" },
      F = { title: "title", notes: "recruiter note", industry: "industry" };
    const chips = (terms, text) =>
      (terms || [])
        .map((t) => '<span class="chip">' + esc(t) + "</span>")
        .concat(
          Object.entries(text || {}).flatMap(([f, ws]) =>
            ws.map(
              (w) =>
                '<span class="chip" style="border-style:dashed">' +
                F[f] +
                " contains “" +
                esc(w) +
                "”</span>",
            ),
          ),
        )
        .join(" ") || '<span class="muted">none</span>';
    const rows = Object.keys(G)
      .map(
        (g) =>
          '<tr class="g"><td colspan="4">' +
          G[g] +
          "</td></tr>" +
          Object.entries(tx[g])
            .map(
              ([r, d]) =>
                "<tr><td><b>" +
                esc(r) +
                "</b></td><td>" +
                chips(d.full, d.text_full) +
                "</td><td>" +
                chips(d.partial, d.text_partial) +
                "</td><td>" +
                chips(d.exclude) +
                "</td></tr>",
            )
            .join(""),
      )
      .join("");
    const w = D.config.weights;
    return (
      '<div class="pagehead"><h1>How it works</h1><p>Four steps, one after the other. The same code runs here and on the command line.</p></div><div class="steps">' +
      [
        [
          "Capture",
          "Every attendee becomes a contact with a record of where we met. Importing a file twice creates no duplicates, and rows we cannot use wait in a correction queue.",
        ],
        [
          "Enrich and classify",
          "A LinkedIn profile is attached by URL when one exists. Title, skills and industry tell us what the person does, and we compare that with the conference's field. No profile? They are kept and classified from the badge.",
        ],
        [
          "Match to a role",
          "Each requirement is looked up in a term table. An equivalent term earns full credit, a related one half, a misleading one nothing. No evidence means a question to ask, never a rejection.",
        ],
        [
          "Find an introduction",
          "Connections are checked against the current employee list and graded by shared work history. They shape the next step and never change the score.",
        ],
      ]
        .map(
          (x, i) =>
            '<div><span class="n">' +
            (i + 1) +
            "</span><h3>" +
            x[0] +
            '</h3><p class="muted">' +
            x[1] +
            "</p></div>",
        )
        .join("") +
      "</div>" +
      '<div class="block"><h3>How the score is built</h3><p class="muted" style="max-width:76ch;margin-top:6px">Required skills ' +
      w.required +
      ", key domains " +
      w.domains +
      ", role family " +
      w.role_family +
      ", seniority " +
      w.seniority +
      ", nice to have " +
      w.nice_to_have +
      ". Inside each group every requirement weighs the same. These are starting values: six alternative weightings, from equal weights to 80% on required skills, keep at least 7 of the top 10 for every job, so the list follows the evidence more than the exact numbers. Try the sliders on the shortlist.</p></div>" +
      '<div class="block"><h3>Term table for ' +
      esc(result.job.title) +
      '</h3><p class="muted" style="max-width:76ch;margin:6px 0 14px">Job wording and profile wording differ. “Object Detection” is required for the ML role and appears in none of the 75 profiles; YOLO does. The table is plain configuration, a first version for the hiring manager to review.</p>' +
      '<div class="card tablewrap"><table class="terms"><thead><tr><th>Job requirement</th><th>Equivalent, full credit</th><th>Related, half credit</th><th>Misleading, no credit</th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div></div>"
    );
  }

  // ---------- Wiring ----------
  function render(keepFocus) {
    const active = keepFocus && document.activeElement ? document.activeElement.id : null,
      pos = active && document.activeElement.selectionStart;
    document
      .querySelectorAll("nav.tabs button")
      .forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
    $("#job").value = state.jobId;
    $("#roles").innerHTML = jobs
      .map(
        (j) =>
          '<button class="rolebtn" data-job="' +
          esc(j.job_id) +
          '" aria-current="' +
          (j.job_id === state.jobId) +
          '"><b>' +
          esc(j.title) +
          "</b><span>" +
          esc(j.department) +
          '</span><i title="On the shortlist">' +
          counts[j.job_id] +
          "</i></button>",
      )
      .join("");
    $("#view").innerHTML =
      state.view === "matches" ? matchesHtml() : state.view === "pool" ? poolHtml() : howHtml();
    if (state.view === "matches") $("#conn").value = state.conn;
    if (active && $("#" + active)) {
      const el = $("#" + active);
      el.focus();
      if (pos != null && el.setSelectionRange)
        try {
          el.setSelectionRange(pos, pos);
        } catch (e) {}
    }
  }
  function csvNow() {
    return T.exportMatches(result.shortlist, result.job);
  }
  function readFile(input) {
    return new Promise((res) => {
      const f = input.files && input.files[0];
      if (!f) return res(null);
      const r = new FileReader();
      r.onload = () => res({ text: String(r.result), name: f.name });
      r.onerror = () => res(null);
      r.readAsText(f);
    });
  }

  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.view) {
      state.view = t.dataset.view;
      render();
      window.scrollTo(0, 0);
    } else if (t.dataset.job) {
      state.jobId = t.dataset.job;
      state.selected = null;
      state.csv = "";
      state.view = "matches";
      try {
        location.hash = t.dataset.job;
      } catch (e) {}
      compute();
      render();
    } else if (t.classList.contains("row")) {
      state.selected = t.dataset.id;
      render();
      if (window.matchMedia("(max-width:1120px)").matches)
        document.querySelector(".detail").scrollIntoView({ behavior: "smooth" });
    } else if (t.id === "reset") {
      state.weights = Object.assign({}, D.config.weights);
      compute();
      render();
    } else if (t.id === "export") {
      const csv = csvNow();
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = result.job.job_id + "_shortlist.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {}
      state.csv = csv;
      render();
      toast(
        "CSV prepared: " +
          result.shortlist.length +
          " rows. If no download started, copy it from the box below.",
      );
    } else if (t.id === "copy") {
      const csv = csvNow();
      state.csv = csv;
      render();
      try {
        await navigator.clipboard.writeText(csv);
        toast("Shortlist CSV copied to the clipboard.");
      } catch (e) {
        toast("Copy was blocked by the browser. Select the text in the box instead.");
      }
    } else if (t.id === "do-import") {
      const att = await readFile($("#f-att")),
        prof = await readFile($("#f-prof"));
      if (!att) return toast("Choose an attendees CSV first.");
      const rows = T.parseCsv(att.text),
        need = ["full_name", "conference_name"];
      rows.forEach((r, i) => {
        r._row_number = i + 2;
        r._source_file = att.name;
      });
      if (!rows.length || need.some((k) => !(k in rows[0])))
        return toast(
          "That file does not look like an attendee export: it needs full_name and conference_name columns.",
        );
      const before = pool.summary,
        beforeCount = pool.contacts.length;
      state.attendees = state.attendees.concat(rows);
      if (prof) state.profiles = state.profiles.concat(T.parseCsv(prof.text));
      compute();
      const s = pool.summary;
      state.imported = {
        rows: rows.length,
        created: pool.contacts.length - beforeCount,
        updated: s.updated - before.updated,
        encounters: s.encounters_added - before.encounters_added,
        held: s.corrections + s.identity_review - before.corrections - before.identity_review,
      };
      render();
      toast("Import finished.");
    } else if (t.id === "undo-import") {
      state.attendees = T.parseCsv(D.attendees);
      state.profiles = T.parseCsv(D.profiles);
      state.imported = null;
      compute();
      render();
    }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "q") {
      state.search = t.value;
      render(true);
    } else if (t.dataset.w) {
      state.weights[t.dataset.w] = Number(t.value);
      compute();
      render(true);
    } else if (t.id === "pq") {
      state.pf.q = t.value;
      render(true);
    }
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.id === "job") {
      state.jobId = t.value;
      state.selected = null;
      state.csv = "";
      try {
        location.hash = t.value;
      } catch (e) {}
      compute();
      render();
    } else if (t.id === "conn") {
      state.conn = t.value;
      render();
    } else if (t.id === "p-conf") {
      state.pf.conference = t.value;
      render();
    } else if (t.id === "p-dom") {
      state.pf.domain = t.value;
      render();
    } else if (t.id === "p-rel") {
      state.pf.relevance = t.value;
      render();
    }
  });
  function fromHash() {
    const h = (location.hash || "").replace("#", "");
    if (jobs.some((j) => j.job_id === h) && h !== state.jobId) {
      state.jobId = h;
      state.selected = null;
      compute();
      render();
    }
  }
  window.addEventListener("hashchange", fromHash);

  $("#job").innerHTML = jobs
    .map(
      (j) =>
        '<option value="' + esc(j.job_id) + '">' + esc(j.job_id + " · " + j.title) + "</option>",
    )
    .join("");
  const h = (location.hash || "").replace("#", "");
  if (jobs.some((j) => j.job_id === h)) state.jobId = h;
  compute();
  render();
})();
