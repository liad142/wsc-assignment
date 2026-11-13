# Stated assumptions

Written before the code. Each assumption says what we decided, why, and what the demo does about it.
Numbers marked *(starting value)* are our own choices, kept in `config/scoring.json` so they can be changed without touching code.

## A. The seven questions in the brief

### 1. How do we define "domain relevance"?
**Assumption.** Relevance is judged from what a person actually does, not from which conference they attended. We first classify each contact into one or more *professional domains* using evidence (current title, skills, industry, past titles, recruiter note), then compare that with the conference's domain. The result is one of four levels: *in domain*, *adjacent*, *outside*, *unknown*.
**Why.** A badge title is not enough. A "Senior Software Engineer" at a sports-tech summit turns out to be a Java developer in financial services once the profile is attached.
**Consequence.** Relevance is a filter, never a gate. A sales rep met at a DevOps conference is tagged *outside* for that event and kept as a sales professional; they surface when a sales role opens.
**In the demo.** 75 contacts: 49 in domain, 9 adjacent, 17 outside, 0 unknown.

### 2. What happens to a contact with no LinkedIn profile match?
**Assumption.** They are kept. The reason is stored on the contact (`no_profile_url`, `profile_not_found`, `identity_mismatch`, `ambiguous_profile`), and they are classified from what was captured at the event: badge title, company, recruiter note. Any match they receive is labelled *preliminary*.
**Why.** The brief's core problem is contacts being lost. Dropping people because enrichment failed would recreate it.
**In the demo.** All 75 attendees have a matching profile, so this path does not occur in a normal run. It is exercised by automated tests that remove or alter profiles.

### 3. Is one mutual connection treated the same as three?
**Assumption.** The count does not matter; the strength does. Each connection is graded: *worked together* (same employer, overlapping years), *same employer* (overlap not confirmed), or *LinkedIn only*. Connections add **zero** points to the match score.
**Why.** A LinkedIn connection is not proof that two people know each other. In the data only 13 of 79 connection pairs are backed by overlapping work history. Giving points for connections would rank well-networked people above better-qualified ones.
**Consequence.** Connections change the recruiter's *next step* (who to ask for an introduction), not the candidate's rank.

### 4. Should candidates already in the ATS (Comeet) be flagged differently?
**Assumption.** Flag, do not filter. ATS status does not change the match score; it changes the action. *Active process* -> do not contact, coordinate with the owning recruiter. *Previously rejected* -> show date, role and reason so the recruiter decides. *Hired* -> removed from the list.
**Why.** Someone rejected for a backend role two years ago may fit a data role today; ignoring ATS status risks duplicate outreach.
**In the demo.** No ATS data is provided, so every row carries `ats_status = unknown`.

### 5. What is the refresh cadence?
**Assumption.** Three cadences, by what changes: **capture** after every conference; **matching** whenever a role opens or its requirements change; **re-enrichment** periodically, for stale profiles only (every 6 months, *starting value*).
**Why.** Recomputing everything on every run does not scale and is not needed: the pool is built once and each new role is a cheap query against it.
**In the demo.** On demand, per `job_id`.

### 6. Who triggers the pipeline?
**Assumption.** Automatic by default, manual always available. Capture runs when a badge-scan export arrives or a QR form is submitted. Matching runs when a role is opened in Comeet, and the recruiter is notified. A recruiter can re-run matching at any time.
**Why.** The problem described is that contacts are forgotten within days. A process that depends on someone remembering to start it fails the same way.
**In the demo.** Manual: the command line or the app.

### 7. Privacy and GDPR
**Assumption.** Five rules, all to be confirmed with WSC's legal counsel before production:
1. **Purpose limitation.** Data is collected for recruiting only; conference contacts do not enter marketing campaigns in HubSpot.
2. **Documented lawful basis.** Explicit consent on the QR path. The badge-scan path has a weaker basis, so those contacts are not auto-enriched from LinkedIn without consent.
3. **Data minimisation.** Only the fields classification and matching need are stored.
4. **Retention.** Delete, or ask for renewed consent, after 24 months without contact (*starting value*).
5. **Data-subject rights.** Access and deletion requests are handled in one place and propagate to every system.
**In the demo.** Data is simulated; every row carries `consent_basis = not recorded`.

## B. Data quality

- The CSV files are the *end state* of capture and enrichment. `conference_attendees.csv` stands in for the output of stage 1, `linkedin_profiles.csv` for the response of an approved profile source.
- `linkedin_url` is the join key between attendees and profiles, compared after normalising case, protocol, `www.` and trailing slashes. A name is never enough to merge two records.
- A blank value in a new import never overwrites existing data. Re-importing a file creates no duplicates.
- The files contain three columns the brief does not list (`conference_domain`, `past_titles`, `work_history`). We use all three: the first for relevance, the other two to grade connections.
- Skills on a profile are self-reported. A listed skill shows the person claims it, not that they master it. We therefore show where each piece of evidence came from, and whether a title, past title or recruiter note backs it.
- A profile is not a complete record. A required skill with no evidence is marked *to verify*; it never disqualifies.

## C. Scoring logic

- **Term table.** Job wording and profile wording differ: "Object Detection" is a required skill for JOB001 and appears literally in none of the 75 profiles. `config/taxonomy.json` lists, per requirement, *equivalent* terms (full credit), *related* terms (half credit) and *misleading* terms (no credit). It is a first version, written by us, to be reviewed by the hiring manager.
- **Free text is weak evidence.** A recruiter's note counts only for a specific phrase ("highlight" for Sports Video Analysis). A generic word does not: "working on player tracking" in a note about a data engineer is not evidence of Object Detection, and counting it put a data engineer on the ML shortlist in an early version. A test now guards this.
- **Weights** *(starting values)*: required skills 60, key domains 25, role family 5, seniority 5, nice-to-have 5. Inside a group every requirement weighs the same, because the job file gives no relative importance.
- **Why these weights.** Required skills weigh most because WSC labelled them "required". The exact numbers matter little: six alternative schemes, from equal weights to 80% on required skills, keep at least 7 of the top 10 for every job, and usually 9 or 10 (`node tools/sensitivity.js`). We cannot claim one scheme is *more accurate*; that needs hiring outcomes, which the data does not contain.
- **Bands, not ranks.** Scores closer than 3 points *(starting value)* are shown as one priority band. Inside a band, order is by required-skill coverage, then by how well the evidence is backed.
- **Shortlist rule.** A contact is shortlisted when at least half of the required-skill credit is covered *and* there is some evidence for at least one key domain. Everyone else stays in the pool, visible below the line.
- **Seniority** *(starting values)*. Senior role: full credit for a senior title, half for 7+ years without one. Mid-Senior: senior title or 4+ years. Mid: 3+ years. Someone senior for a mid role is not penalised, only noted.
- **Role family.** Full credit when the current title belongs to the job's family, half for a neighbouring title or a past title in the family.
- The score describes *documented coverage of the job's requirements*. It is not a probability of success in the role.

## D. Scope

- English only, local data only, no API keys, no connection to LinkedIn, HubSpot or Comeet.
- No language model is called. In production a model would *propose* new term-table rows for a human to approve; it would not score people.
- Output is one row per contact and job, so matching the same person against a second role does not overwrite the first result.
