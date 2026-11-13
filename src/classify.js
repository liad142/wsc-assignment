// Stage 2b - domain relevance. Works out what the person does (professional domain) from evidence,
// then compares it with the domain of the conference where we met them. Nobody is removed here.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else { root.TalentOps = root.TalentOps || {}; Object.assign(root.TalentOps, factory(function () { return root.TalentOps; })); }
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  // One flat view of everything we know about a person, used by classification and matching alike.
  function evidenceOf(contact) {
    const p = contact.profile, last = contact.encounters[contact.encounters.length - 1] || {};
    return {
      title: (p ? p.current_title : contact.title || last.title_at_event || "").toLowerCase(),
      skills: p ? p.skills : [],
      industry: (p ? p.industry : "").toLowerCase(),
      past_titles: (p ? p.past_titles.join("; ") : "").toLowerCase(),
      notes: contact.encounters.map((e) => e.notes).filter(Boolean).join("; ").toLowerCase(),
      years: p ? p.years_experience : null,
      from_profile: !!p,
    };
  }
  function classifyDomains(contact, config) {
    const ev = evidenceOf(contact), skillSet = new Set(ev.skills.map((s) => s.toLowerCase())), found = [];
    for (const [domain, rule] of Object.entries(config.professional_domains)) {
      const titleHit = rule.title.find((t) => (" " + ev.title + " ").includes(t.length <= 4 ? " " + t.trim() + " " : t));
      const skillHits = rule.skills.filter((s) => skillSet.has(s.toLowerCase()));
      if (titleHit) found.push({ domain, basis: "current title", evidence: [contact.profile ? contact.profile.current_title : contact.title].concat(skillHits), strength: 2 });
      else if (skillHits.length >= 2) found.push({ domain, basis: "skills", evidence: skillHits, strength: 1 });
    }
    found.sort((a, b) => b.strength - a.strength || b.evidence.length - a.evidence.length);
    return found;
  }
  function conferenceRelevance(domains, contact, encounter, config) {
    const rule = config.conference_relevance[encounter.conference_domain];
    if (!rule) return { level: "unknown", reason: "Conference domain is not defined in the configuration" };
    if (!domains.length) return { level: "unknown", reason: "Not enough evidence to tell what this person does" };
    const ev = evidenceOf(contact), names = domains.map((d) => d.domain);
    const haystack = [ev.industry, ev.skills.join(" ").toLowerCase(), ev.notes].join(" ");
    const industryHit = rule.industry_terms.find((t) => haystack.includes(t));
    const inDomain = names.find((n) => rule.in_domains.includes(n));
    const adjacent = names.find((n) => rule.adjacent_domains.includes(n));
    if (rule.in_requires_industry) {
      if (industryHit) return { level: "in_domain", reason: "Works in the conference industry ('" + industryHit + "') as " + names[0] };
      if (adjacent) return { level: "adjacent", reason: names[0] + " professional, but outside the conference industry" };
      return { level: "outside", reason: names[0] + " in an unrelated industry" };
    }
    if (inDomain) return { level: "in_domain", reason: inDomain + " is the core audience of this conference" };
    if (adjacent) return { level: "adjacent", reason: adjacent + " is a neighbouring field" };
    if (rule.industry_makes_adjacent && industryHit) return { level: "adjacent", reason: "Works in the conference industry ('" + industryHit + "') in another function" };
    return { level: "outside", reason: names[0] + " is not what this conference is about" };
  }
  function classifyAll(contacts, config) {
    return contacts.map((c) => {
      const domains = classifyDomains(c, config);
      const encounters = c.encounters.map((e) => Object.assign({}, e, { relevance: conferenceRelevance(domains, c, e, config) }));
      return Object.assign({}, c, { professional_domains: domains, encounters, classified_from: c.profile ? "LinkedIn profile" : "event details only" });
    });
  }
  return { classifyAll, classifyDomains, conferenceRelevance, evidenceOf };
});
