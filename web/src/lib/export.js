// Export tables to a CSV file that opens in Excel (UTF-8 with BOM keeps the Arabic readable).
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function downloadCSV(filename, sections) {
  // sections: [{ title?, head: [...], rows: [[...]] }]
  const lines = [];
  sections.forEach((sec, i) => {
    if (i) lines.push('');
    if (sec.title) lines.push(cell(sec.title));
    lines.push(sec.head.map(cell).join(','));
    sec.rows.forEach((r) => lines.push(r.map(cell).join(',')));
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
