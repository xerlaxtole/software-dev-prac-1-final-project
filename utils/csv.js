//Build a CSV string (shared by the provider and booking exports).
//- Quotes fields containing , " or line breaks (RFC 4180).
//- Prefixes values starting with = + - @ so Excel won't run them as formulas (CSV injection).
//- Leading BOM so Excel reads Thai text as UTF-8.
const cell = (value) => {
  let s = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

exports.toCsv = (headers, rows) =>
  '﻿' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
