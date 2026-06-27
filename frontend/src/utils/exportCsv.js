// Converts an array of objects to CSV and triggers a download.
// rows: array of objects. headers: optional [{ key, label }] to control columns/order.
export const exportToCsv = (filename, rows, headers = null) => {
  if (!rows || rows.length === 0) {
    alert('No data to export');
    return;
  }

  // Determine columns
  const cols = headers || Object.keys(rows[0]).map(k => ({ key: k, label: k }));

  // Escape a CSV cell (wrap in quotes, double internal quotes)
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = cols.map(c => escape(c.label)).join(',');
  const dataLines = rows.map(row =>
    cols.map(c => escape(row[c.key])).join(',')
  );

  const csv = [headerLine, ...dataLines].join('\n');

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};