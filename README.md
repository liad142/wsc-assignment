# TalentOps: conference talent pool

Take-home submission for the AI Solution Manager recruitment task.

https://github.com/user-attachments/assets/5d598655-40fe-4ba2-af65-d0bfa2f114a1

The story in 88 seconds, sound on. The file is also in the repository: [`docs/media/talentops-film.mp4`](docs/media/talentops-film.mp4). Music and sound credits: [`docs/media/CREDITS.md`](docs/media/CREDITS.md).

A pipeline that turns conference attendees into a lasting talent pool, works out what each person actually does, and, when a role opens, shows the recruiter who to contact, why, what still needs checking, and which WSC employee might know them.

## What is in this submission

| The brief asks for | Where it is |
|---|---|
| Working pipeline, runnable on the provided CSVs with a `job_id` | `run.js`, `src/`; setup and run instructions below |
| Output CSV for JOB001 | [`output/JOB001_shortlist.csv`](output/JOB001_shortlist.csv) (the other three jobs are there too) |
| Design document, 1-2 pages | [`docs/DESIGN.md`](docs/DESIGN.md): why this approach, production integrations, scale, more time |
| Schema and flow; definition of the output | [`docs/FLOW_AND_SCHEMA.md`](docs/FLOW_AND_SCHEMA.md): diagrams, each step (in, what happens, out, why), data model, every output column |
| Stated assumptions | [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md); summary [below](#assumptions-in-brief) |
| Executive summary (optional) | Next section |
| HTML or CLI summary view (bonus) | `app.html` ([open it live](https://liad142.github.io/wsc-assignment/app.html)), and the table `run.js` prints |
| Missing profiles, no connections, partial matches | [Missing and partial data](docs/FLOW_AND_SCHEMA.md#5-missing-and-partial-data), each case with a test |

## Executive summary (for a non-technical reader)

Our recruiters meet strong candidates at conferences, and within days most of those contacts are lost: they live on business cards and in phone notes. Even when a list survives, someone has to read through every attendee to find the few who fit, because a DevOps conference is also full of IT managers and vendor sales reps.

TalentOps keeps every person we meet and records where we met them. It reads their professional profile to understand what they really do, so a sales rep met at a DevOps event is stored as a sales professional, not as an engineer. When a role opens, the recruiter picks it and gets a short, ordered list: for each person, which of the job's requirements are documented, what still needs to be asked, and whether a colleague at WSC has actually worked with them. Nothing is a black box: every line on the screen points to the evidence behind it. The recruiter stays in charge of the decision; the tool removes the hours of manual screening that come before it.

## Quick start

Requirements: [Node.js](https://nodejs.org) 18 or later. No packages to install, no API keys, no network access.

```bash
node run.js --job JOB001        # demo job: Senior ML Engineer
```

This prints the shortlist, the three contacts just below the line, and writes `output/JOB001_shortlist.csv`. Other jobs: `JOB002`, `JOB003`, `JOB004`. Add `--all` to export every contact, including those below the shortlist line.

**Recruiter view (no spreadsheet needed):** open it live at **<https://liad142.github.io/wsc-assignment/app.html>**, or double-click `app.html` after downloading the repository. It needs no server and no Node, and runs the same engine as the command line. The data is the simulated sample; nothing leaves the page.

```bash
node tests/run-tests.js         # 28 engine tests, including every missing-data path
node tools/sensitivity.js       # shows how little the ranking depends on the exact weights
node tools/benchmark.js         # matching time as the pool grows to 100,000 contacts
node tests/ui-smoke.js          # optional: 10 browser tests, needs Chrome and Node 22
node app/build.js               # rebuild app.html after changing code, config or data
```

## What to look at in the demo (about three minutes)

1. **`app.html`, Shortlist, Senior ML Engineer (JOB001).** Three people share the top band. "Object Detection" is a required skill that appears in none of the 75 profiles; open **Priya Anand** to see it matched through YOLO, and **Marcus Reid** to see "Event Detection" correctly *not* counted.
2. **Connections.** Lucas Evans has three WSC connections, all LinkedIn-only. Priya has two, and one of them worked at Mobileye in the same years. The count is not what matters.
3. **Switch the role to Data Engineer (JOB004).** A different list, different evidence: Yuki Tanaka is in the top band here and not on the ML list at all. Then the Product role (JOB003): only two people pass, and the tool says so rather than padding the list.
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

Each step in full, with why it exists and what replaces the CSV in production: [docs/FLOW_AND_SCHEMA.md](docs/FLOW_AND_SCHEMA.md).

## Assumptions in brief

The reasoning behind each one is in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

1. **Domain relevance** is judged from what a person does (title, skills, industry), then compared with the conference domain: in domain, adjacent, outside or unknown. It is a label, never a gate; nobody is deleted.
2. **No LinkedIn profile:** the contact is kept, the reason is stored, and they are classified from the badge details. Their match is marked preliminary.
3. **One connection or three:** the count does not matter, the strength does. Connections are graded by shared work history and add no points to the score.
4. **Already in Comeet:** flag, do not filter. ATS status changes the recruiter's action, not the score.
5. **Refresh cadence:** capture after every conference, matching whenever a role opens or changes, re-enrichment only for stale profiles.
6. **Trigger:** automatic by default (badge export, QR form, a role opened in Comeet), manual always available.
7. **Privacy:** recruiting purpose only, recorded consent, minimal data, a retention period, one place for access and deletion requests. To be confirmed with legal counsel.

## Scoring in one paragraph

Score = 60 × required-skill coverage + 25 × key-domain coverage + 5 × role family + 5 × seniority + 5 × nice-to-have, out of 100. Inside a group every requirement weighs the same. A contact is shortlisted when at least half of the required-skill credit is covered and there is some evidence for one key domain. Scores within 3 points are shown as one priority band. Mutual connections add no points. All of these numbers live in `config/scoring.json`, and the term table in `config/taxonomy.json`; neither needs a code change to adjust.

## Output file

`output/JOB001_shortlist.csv`, one row per shortlisted contact. Every column is described in [docs/FLOW_AND_SCHEMA.md](docs/FLOW_AND_SCHEMA.md#4-the-output), with the HubSpot field it maps to.

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
output/                 the shortlist for each of the four jobs; JOB001 is the required one
tests/                  engine tests and an optional browser test
tools/                  sensitivity.js (do the weights matter?), benchmark.js (how fast at scale?)
docs/                   DESIGN.md, FLOW_AND_SCHEMA.md, ASSUMPTIONS.md, flow.html, img/ (the flow diagrams) and media/ (the video)
```

To extend it: a new job needs a block in `taxonomy.json` and a line in `role_family`; a new conference needs a line in `conference_relevance`; a new scoring rule is a function in `src/match.js` with a test beside it.

## Limits worth stating

- The term table and every threshold are first versions written for this exercise. They need a hiring manager's review before real use.
- The score measures documented coverage of a job's requirements. It does not predict performance, and the data contains no hiring outcomes to validate it against.
- Skills are self-reported. The tool shows where each one was found and what backs it; it cannot confirm mastery.
- No live system is contacted. `ats_status` and `consent_basis` are placeholders that show where real data would go.
