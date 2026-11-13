# Design document

Flow, data model and output fields: [FLOW_AND_SCHEMA.md](FLOW_AND_SCHEMA.md). Assumptions: [ASSUMPTIONS.md](ASSUMPTIONS.md).

## The problem

Two things go wrong today, at two different moments. **After a conference**, contacts are captured nowhere and are forgotten within days. **When a role opens**, even a saved list would not help much, because conference crowds are mixed: a DevOps event has platform engineers and SREs, and also IT managers, network admins and vendor sales reps. Someone would still screen every name by hand. That is the core pain: **signal-to-noise**. So the system keeps every encounter, and understands what each person does well enough that a recruiter never reads the full list.

## Why this approach

- **Keep everyone, classify by profession.** Noise is relative to the search: a sales rep is noise in a DevOps search and the answer to a sales opening. Relevance is a label on a complete pool, not a gate.
- **Evidence per requirement, then a score.** The unit of work is one requirement checked against one person, with the matched term and where it was found. The score is only the sum, so every point can be explained.
- **A term table, not string matching or a model's opinion.** Exact matching fails on this data: "Object Detection" is required for JOB001 and appears in none of the 75 profiles. Loose matching fails the other way: "Event Detection" is a different skill. A table of equivalent, related and misleading terms handles both, and a recruiter can read and change it.
- **Rules, not a model, for scoring.** A fixed rule treats every candidate the same way and can be audited. Selection research finds that combining information by rule matches or beats holistic judgement, and that exact weights matter less than consistency (Kuncel et al. 2013; Bobko, Roth & Buster 2007; Dawes 1979). Our own check agrees: six alternative weightings keep at least 7, usually 9 or 10, of the top 10 for every job. Near-ties are shown as one priority band, because 83.0 against 82.3 is not a real difference.
- **Connections graded, not counted.** A LinkedIn connection is a click; a shared employer in overlapping years is evidence. Only 13 of the 79 connection pairs in the data have it. Connections add no points; they decide who the recruiter talks to first.

## Production: what replaces each CSV

| Layer | Here | In production |
|---|---|---|
| Capture | `conference_attendees.csv` | A QR code per event opens a page with [Sign in with LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) and explicit consent. The open sign-in returns name, email and a member ID; a profile URL needs [a permission LinkedIn must approve](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access); work history and skills come only through talent partner integrations. The page works at all three levels; badge scans and recruiter notes cover people who do not scan. |
| Enrichment | `linkedin_profiles.csv` | An approved source only: LinkedIn Recruiter with a [CRM integration](https://business.linkedin.com/talent-solutions/linkedin-hiring-integrations/talent-crm-integration) if WSC's licence supports it, otherwise what the attendee shares. A licensing question to settle before building. |
| Talent pool | In memory | HubSpot. Contacts upserted in batches through the [CRM API](https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/guide), keyed on a custom unique property. Encounters and matches as [custom objects](https://knowledge.hubspot.com/object-settings/create-custom-objects) associated with the contact; these need an Enterprise subscription, and without one the latest match is written to contact properties. |
| Role trigger | `--job JOB001` | Comeet's [position webhook](https://developers.comeet.com/reference/position-updates) starts a matching run and notifies the recruiter. Comeet's [candidate API](https://developers.comeet.com/reference/get-list-candidates) (status, rejection reason) fills `ats_status`, so people already in process are flagged before outreach. |
| Term table | Hand-written JSON | A language model *proposes* rows for a new role or skill; a hiring manager approves them. The model never scores a person. |

## At scale (hundreds of conferences, thousands of contacts)

- **Two processes, two triggers.** The pool is built per import; matching runs per role, as a query over the pool.
- **Incremental work only.** Enrich new contacts and stale profiles; re-match only what changed.
- **Matching is cheap.** Ten thousand contacts against one role take about half a second in one process (`node tools/benchmark.js`). No vector database or model call is needed for scoring.
- **The term table is what does not scale by hand.** Four roles can be mapped manually; a hundred cannot. Model-assisted proposals and a standard skills taxonomy such as ESCO earn their place here.
- **What volume adds:** a retry queue for enrichment, HubSpot rate limits, versioned term tables and weights so a past shortlist can be reproduced, an audit log, and the privacy rules in the assumptions.

## With more time

1. **Measure it.** A recruiter and a hiring manager label a sample per role, including people below the line. Without this, no weighting can be called accurate.
2. **Feedback loop.** "Not relevant" and "good find" buttons that feed the term-table review.
3. **Evidence from free text**, extracted by a model with the exact quote as proof.
4. **Real integrations** behind the same interfaces, and outreach drafts that mention where we met.
