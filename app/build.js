// Builds app.html: one self-contained file (engine + data + UI) that opens with a double-click.
// Run after changing anything in src/, config/, data/ or app/:  node app/build.js
"use strict";
const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const engine = ["csv", "ingest", "enrich", "classify", "match", "connections", "exporter", "pipeline"].map((f) => read("src", f + ".js")).join("\n");
const data = {
  attendees: read("data", "conference_attendees.csv"), profiles: read("data", "linkedin_profiles.csv"),
  jobs: read("data", "job_openings.csv"), employees: read("data", "wsc_employees.csv"),
  taxonomy: JSON.parse(read("config", "taxonomy.json")), config: JSON.parse(read("config", "scoring.json")),
};
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
const html = read("app", "template.html")
  .replace("/*CSS*/", () => read("app", "style.css"))
  .replace("/*DATA*/", () => safe(JSON.stringify(data)))
  .replace("/*ENGINE*/", () => safe(engine))
  .replace("/*UI*/", () => safe(read("app", "ui.js")));
fs.writeFileSync(path.join(root, "app.html"), html);
console.log("Wrote app.html (" + Math.round(html.length / 1024) + " KB)");
