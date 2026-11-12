import { humanizeStatus, type AdminReport } from '@/shared/domain';

/**
 * Neutralizes spreadsheet formula injection (Excel, LibreOffice Calc, Google Sheets)
 * and applies RFC 4180 CSV quoting.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  let text = String(value);
  // Prefix an apostrophe whenever a string starts with a formula trigger character,
  // including when preceded by leading whitespace or tab/CR control characters.
  if (/^[\t\r]|^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

function metricCell(value: number | null): number | string {
  return value === null ? 'Restricted' : value;
}

export function formatReportCsv(report: AdminReport): string {
  const lines: string[] = [];

  lines.push(csvRow(['ParishLink Operational Report']));
  lines.push(csvRow(['Scope', report.scopeLabel]));
  lines.push(csvRow(['Generated At', report.generatedAt]));
  lines.push(csvRow(['Date From', report.filters.from ?? 'All dates']));
  lines.push(csvRow(['Date To', report.filters.to ?? 'All dates']));
  lines.push(csvRow(['Sacrament Filter', report.filters.serviceTypeId ?? 'All sacraments']));
  lines.push(csvRow(['Status Filter', report.filters.status === 'all' ? 'All statuses' : humanizeStatus(report.filters.status)]));
  lines.push('');

  lines.push(csvRow(['Summary Metric', 'Value']));
  lines.push(csvRow(['Total Appointments', report.totals.appointments]));
  lines.push(csvRow(['Approved Appointments', report.totals.approved]));
  lines.push(csvRow(['Completed Appointments', report.totals.completed]));
  lines.push(csvRow(['Open / Pending Appointments', report.totals.pending]));
  lines.push(csvRow(['Cancelled or Rejected Appointments', report.totals.cancelledOrRejected]));
  lines.push(csvRow(['No-Show Appointments', report.totals.noShow]));
  lines.push(csvRow(['Documents Awaiting Review', metricCell(report.totals.awaitingDocumentReview)]));
  lines.push(csvRow(['Human-Verified Documents', metricCell(report.totals.verifiedDocuments)]));
  lines.push(csvRow(['Average Document Review Turnaround (hours)', metricCell(report.totals.avgDocumentReviewHours)]));
  lines.push(csvRow(['Archive-Verified Sacramental Records', metricCell(report.totals.verifiedRecords)]));
  lines.push(csvRow(['Walk-In Tickets Served', metricCell(report.totals.queueServed)]));
  lines.push(csvRow(['Average Walk-In Queue Wait (minutes)', metricCell(report.totals.avgQueueWaitMinutes)]));
  lines.push('');

  lines.push(csvRow(['Status Distribution', 'Count']));
  for (const row of report.byStatus) {
    lines.push(csvRow([humanizeStatus(row.status), row.count]));
  }
  lines.push('');

  lines.push(csvRow(['Sacrament', 'Total', 'Approved / Completed', 'Open / Pending', 'Closed']));
  for (const row of report.byService) {
    lines.push(csvRow([row.label, row.total, row.approvedOrCompleted, row.pending, row.closed]));
  }
  lines.push('');

  lines.push(csvRow(['Parish', 'Total', 'Approved / Completed', 'Open / Pending', 'Closed']));
  for (const row of report.byParish) {
    lines.push(csvRow([row.label, row.total, row.approvedOrCompleted, row.pending, row.closed]));
  }
  lines.push('');

  lines.push(csvRow(['Month (Asia/Manila)', 'Total', 'Approved', 'Completed']));
  for (const row of report.byMonth) {
    lines.push(csvRow([row.month, row.total, row.approved, row.completed]));
  }
  lines.push('');

  lines.push(
    csvRow([
      'Reference',
      'Parishioner',
      'Sacrament',
      'Parish',
      'Clergy',
      'Venue',
      'Starts At',
      'Status',
      'Verified Documents',
      'Required Documents',
    ]),
  );
  for (const item of report.appointments) {
    lines.push(
      csvRow([
        item.reference,
        item.parishioner,
        item.service,
        item.parish,
        item.clergy,
        item.venue,
        item.startsAt,
        humanizeStatus(item.status),
        item.verifiedDocuments,
        item.requiredDocuments,
      ]),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
