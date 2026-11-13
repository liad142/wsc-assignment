// CSV parsing and writing. No dependencies, handles quoted fields and embedded commas.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require);
  else
    root.TalentOps = Object.assign(
      root.TalentOps || {},
      factory(() => root.TalentOps),
    );
})(typeof self !== "undefined" ? self : this, function (load) {
  "use strict";
  function parseCsv(text) {
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    const s = String(text).replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"' && s[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) {
      row.push(field);
      if (row.some((v) => v !== "")) rows.push(row);
    }
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    return rows
      .slice(1)
      .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || "").trim()])));
  }
  function toCsv(columns, records) {
    const esc = (v) => {
      const t = v == null ? "" : String(v);
      return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    return (
      [columns.join(",")]
        .concat(records.map((r) => columns.map((c) => esc(r[c])).join(",")))
        .join("\n") + "\n"
    );
  }
  const splitList = (v) =>
    String(v || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
  return { parseCsv, toCsv, splitList };
});
