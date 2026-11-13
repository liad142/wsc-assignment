// Stage 2a - enrichment. Attaches a LinkedIn profile to each contact, or records why it could not.
// A contact without a profile is kept and later classified from what was captured at the event.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else
    root.TalentOps = Object.assign(
      root.TalentOps || {},
      factory(() => root.TalentOps),
    );
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  const { normalizeUrl, normalizeName } = load("./ingest.js");
  const { splitList } = load("./csv.js");
  const STATUS = {
    ENRICHED: "enriched",
    NO_URL: "no_profile_url",
    NOT_FOUND: "profile_not_found",
    MISMATCH: "identity_mismatch",
    AMBIGUOUS: "ambiguous_profile",
  };

  function indexProfiles(profileRows) {
    const index = new Map();
    for (const p of profileRows) {
      const k = normalizeUrl(p.linkedin_url);
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(p);
    }
    return index;
  }
  function enrichContact(contact, profileIndex) {
    const base = { profile: null, enrichment_status: STATUS.ENRICHED, enrichment_note: "" };
    if (!contact.linkedin_url)
      return Object.assign(base, {
        enrichment_status: STATUS.NO_URL,
        enrichment_note: "No LinkedIn URL captured; classified from event details only",
      });
    const hits = profileIndex.get(normalizeUrl(contact.linkedin_url)) || [];
    if (!hits.length)
      return Object.assign(base, {
        enrichment_status: STATUS.NOT_FOUND,
        enrichment_note: "No profile returned for this URL (missing, private or restricted)",
      });
    if (hits.length > 1)
      return Object.assign(base, {
        enrichment_status: STATUS.AMBIGUOUS,
        enrichment_note: "More than one profile returned for this URL",
      });
    const p = hits[0];
    if (p.full_name && normalizeName(p.full_name) !== normalizeName(contact.full_name))
      return Object.assign(base, {
        enrichment_status: STATUS.MISMATCH,
        enrichment_note: "Profile name '" + p.full_name + "' does not match the captured name",
      });
    base.profile = {
      current_title: p.current_title || "",
      current_company: p.current_company || "",
      location: p.location || "",
      years_experience:
        p.years_experience === "" || p.years_experience == null ? null : Number(p.years_experience),
      skills: splitList(p.top_skills),
      industry: p.industry || "",
      past_companies: splitList(p.past_companies),
      past_titles: splitList(p.past_titles),
      mutual_connection_ids: splitList(p.wsc_mutual_connections),
      source: "linkedin_profiles.csv",
    };
    return base;
  }
  function enrichAll(contacts, profileRows) {
    const index = indexProfiles(profileRows);
    return contacts.map((c) => Object.assign({}, c, enrichContact(c, index)));
  }
  return { enrichAll, enrichContact, ENRICHMENT_STATUS: STATUS };
});
