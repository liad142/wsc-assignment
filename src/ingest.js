// Stage 1 - capture. Turns raw attendee rows into contacts with conference encounters.
// Nothing is dropped: unusable rows go to a correction queue, conflicting identifiers to identity review.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else
    root.TalentOps = Object.assign(
      root.TalentOps || {},
      factory(() => root.TalentOps),
    );
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  function normalizeUrl(url) {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/?#]+$/, "");
  }
  const normalizeEmail = (e) =>
    String(e || "")
      .trim()
      .toLowerCase();
  const normalizeName = (n) =>
    String(n || "")
      .toLowerCase()
      .replace(/[^a-zÀ-ɏ ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  function ingestAttendees(rows) {
    const contacts = [],
      byEmail = new Map(),
      byUrl = new Map();
    const corrections = [],
      identityReview = [];
    const summary = {
      rows: rows.length,
      created: 0,
      updated: 0,
      encounters_added: 0,
      corrections: 0,
      identity_review: 0,
    };

    rows.forEach((row, index) => {
      // An import can tag each row with its own file and line, so messages point at the file the recruiter uploaded.
      const where = {
        row_number: row._row_number || index + 2,
        source_file: row._source_file || "",
      };
      const email = normalizeEmail(row.email),
        url = normalizeUrl(row.linkedin_url);
      const missing = [];
      if (!String(row.full_name || "").trim()) missing.push("full_name");
      if (!email && !url) missing.push("email or linkedin_url");
      if (!String(row.conference_name || "").trim()) missing.push("conference_name");
      if (missing.length) {
        corrections.push({
          row_number: where.row_number,
          source_file: where.source_file,
          reason: "Missing " + missing.join(", "),
          row,
        });
        summary.corrections++;
        return;
      }

      const viaEmail = email ? byEmail.get(email) : undefined;
      const viaUrl = url ? byUrl.get(url) : undefined;
      // Two identifiers pointing at two different people: never merge on a guess.
      if (viaEmail && viaUrl && viaEmail !== viaUrl) {
        identityReview.push({
          row_number: where.row_number,
          source_file: where.source_file,
          reason: "Email and LinkedIn URL belong to different contacts",
          row,
        });
        summary.identity_review++;
        return;
      }
      let contact = viaEmail || viaUrl;
      if (contact && normalizeName(contact.full_name) !== normalizeName(row.full_name)) {
        identityReview.push({
          row_number: where.row_number,
          source_file: where.source_file,
          reason: "Same identifier, different name",
          row,
        });
        summary.identity_review++;
        return;
      }
      if (!contact) {
        contact = {
          contact_id: row.hubspot_id || "NEW-" + (index + 1),
          hubspot_id: row.hubspot_id || "",
          full_name: row.full_name,
          email: row.email || "",
          linkedin_url: url,
          company: row.company || "",
          title: row.title || "",
          encounters: [],
        };
        contacts.push(contact);
        summary.created++;
      } else {
        // A blank value in a new import never overwrites existing data.
        for (const f of ["email", "company", "title", "hubspot_id"])
          if (!contact[f] && row[f]) contact[f] = row[f];
        if (!contact.linkedin_url && url) contact.linkedin_url = url;
        summary.updated++;
      }
      if (email) byEmail.set(email, contact);
      if (url) byUrl.set(url, contact);

      const existing = contact.encounters.find(
        (e) =>
          e.conference_name === row.conference_name &&
          e.conference_date === (row.conference_date || ""),
      );
      if (existing) {
        if (row.notes && !existing.notes) existing.notes = row.notes;
      } else {
        contact.encounters.push({
          conference_name: row.conference_name,
          conference_domain: row.conference_domain || "",
          conference_date: row.conference_date || "",
          source: row.source || "",
          notes: row.notes || "",
          title_at_event: row.title || "",
          company_at_event: row.company || "",
        });
        summary.encounters_added++;
      }
    });
    return { contacts, corrections, identityReview, summary };
  }
  return { ingestAttendees, normalizeUrl, normalizeEmail, normalizeName };
});
