# TalentOps: conference talent pool

Take-home submission for the AI Solution Manager recruitment task.

A pipeline that turns conference attendees into a lasting talent pool, works out what each person actually does, and, when a role opens, shows the recruiter who to contact, why, what still needs checking, and which WSC employee might know them.

## Executive summary (for a non-technical reader)

Our recruiters meet strong candidates at conferences, and within days most of those contacts are lost: they live on business cards and in phone notes. Even when a list survives, someone has to read through every attendee to find the few who fit, because a DevOps conference is also full of IT managers and vendor sales reps.

TalentOps keeps every person we meet and records where we met them. It reads their professional profile to understand what they really do, so a sales rep met at a DevOps event is stored as a sales professional, not as an engineer. When a role opens, the recruiter picks it and gets a short, ordered list: for each person, which of the job's requirements are documented, what still needs to be asked, and whether a colleague at WSC has actually worked with them. Nothing is a black box: every line on the screen points to the evidence behind it. The recruiter stays in charge of the decision; the tool removes the hours of manual screening that come before it.

## Quick start

Requirements: [Node.js](https://nodejs.org) 18 or later. No packages to install, no API keys, no network access.

```bash
node run.js --job JOB001        # demo job: Senior ML Engineer
```

This prints the shortlist and writes `output/JOB001_shortlist.csv`. Other jobs: `JOB002`, `JOB003`, `JOB004`. Add `--all` to export every contact, including those below the shortlist line.

**Recruiter view (no spreadsheet needed):** open `app.html` in a browser by double-clicking it. It needs no server and no Node. It runs the same engine as the command line.

```bash
node tests/run-tests.js         # 21 engine tests, including every missing-data path
node tools/sensitivity.js       # shows how little the ranking depends on the exact weights
node tests/ui-smoke.js          # optional: 10 browser tests, needs Chrome and Node 22
node app/build.js               # rebuild app.html after changing code, config or data
```

## What to look at in the demo (about three minutes)

1. **`app.html`, Shortlist, Senior ML Engineer (JOB001).** Three people share the top band. "Object Detection" is a required skill that appears in none of the 75 profiles; open **Priya Anand** to see it matched through YOLO, and **Marcus Reid** to see "Event Detection" correctly *not* counted.
2. **Connections.** Lucas Evans has three WSC connections, all LinkedIn-only. Priya has two, and one of them worked at Mobileye in the same years. The count is not what matters.
3. **Switch the role to Data Engineer (JOB004).** A different list, different evidence. Then the Product role (JOB003): only two people pass, and the tool says so rather than padding the list.
4. **Move a weight slider.** The order shifts slightly; the people on the shortlist do not change.
5. **Talent pool.** Filter "Outside for the conference" to see the noise the brief describes, kept but out of the way. Then import `data/samples/new_conference_export.csv` to see a returning contact gain a second encounter, two contacts kept without a LinkedIn profile, one row sent to the correction queue and one to identity review.

## How it works

| Stage | Input | What happens | Output |
|---|---|---|---|
| 1. Capture | `conference_attendees.csv` | Validate rows, find existing contacts by email then LinkedIn URL, add a conference encounter. Unusable rows go to a correction queue, conflicting identifiers to identity review. | Contacts with encounter history |
| 2. Enrich and classify | Contacts, `linkedin_profiles.csv` | Attach the profile by normalised URL, or record why not. Classify the professional domain from title, skills and industry; compare with the conference domain. | Searchable talent pool, everyone kept |
| 3. Match | Pool, `job_openings.csv`, `job_id` | Look up every job requirement in the term table: equivalent term = full credit, related = half, misleading = none. Add up a coverage score, group near-ties into bands. | Ranked matches with evidence per requirement |
| 4. Connections | Matches, `wsc_employees.csv` | Resolve connection IDs to current employees and grade them by shared work history. | Suggested next step per contact |
| Output | | One row per contact and job. | HubSpot-ready CSV and the recruiter view |

Full detail: [docs/DESIGN.md](docs/DESIGN.md) (design, production integrations, scale), [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) (all stated assumptions, including the seven questions in the brief) and `docs/flow.html` (the full flow as a diagram; open it in a browser).

## Scoring in one paragraph

Score = 60 × required-skill coverage + 25 × key-domain coverage + 5 × role family + 5 × seniority + 5 × nice-to-have, out of 100. Inside a group every requirement weighs the same. A contact is shortlisted when at least half of the required-skill credit is covered and there is some evidence for one key domain. Scores within 3 points are shown as one priority band. Mutual connections add no points. All of these numbers live in `config/scoring.json`, and the term table in `config/taxonomy.json`; neither needs a code change to adjust.

## Output file

`output/JOB001_shortlist.csv`, one row per shortlisted contact:

| Group | Columns |
|---|---|
| Identity (HubSpot keys) | `hubspot_id`, `email`, `full_name`, `current_title`, `current_company`, `linkedin_url` |
| The role | `job_id`, `job_title` |
| Result | `shortlisted`, `priority_band`, `match_score`, `required_coverage` |
| Evidence | `required_met`, `required_partial`, `required_to_verify`, `domain_evidence`, `role_family_fit`, `seniority_fit`, `nice_to_have_met` |
| Who they are | `professional_domains`, `met_at`, `conference_relevance`, `enrichment_status`, `recruiter_notes` |
| Connections | `connection_count`, `strongest_connection`, `internal_connections` |
| Process | `ats_status`, `consent_basis` |
| For the recruiter | `why_this_person`, `next_step` |

## Repository layout

```
run.js                  command-line entry point
app.html                recruiter view, self-contained (built by app/build.js from app/)
src/                    the engine, one file per stage, no dependencies
  csv.js  ingest.js  enrich.js  classify.js  match.js  connections.js  exporter.js  pipeline.js
config/taxonomy.json    term table: equivalent, related and misleading terms per requirement
config/scoring.json     weights, thresholds, seniority and role-family rules, domain definitions
data/                   the four provided CSV files, unchanged; samples/ holds one extra import for the demo
output/                 JOB001_shortlist.csv
tests/                  engine tests and an optional browser test
tools/sensitivity.js    weight sensitivity check
docs/                   DESIGN.md, ASSUMPTIONS.md, flow.html (the flow as a diagram)
```

To extend it: a new job needs a block in `taxonomy.json` and a line in `role_family`; a new conference needs a line in `conference_relevance`; a new scoring rule is a function in `src/match.js` with a test beside it.

## Limits worth stating

- The term table and every threshold are first versions written for this exercise. They need a hiring manager's review before real use.
- The score measures documented coverage of a job's requirements. It does not predict performance, and the data contains no hiring outcomes to validate it against.
- Skills are self-reported. The tool shows where each one was found and what backs it; it cannot confirm mastery.
- No live system is contacted. `ats_status` and `consent_basis` are placeholders that show where real data would go.
