import type { BatchStatusResponse } from '../services/api';

/**
 * Excel-compatible, UTF-8 CSV for a single bulk batch.
 *
 * The backend's results array contains attempted recipients only. Never invent rows for
 * the pending/cancelled totals: those recipients may have no individual result yet.
 */
export function buildBatchResultsCsv(batch: BatchStatusResponse): string {
  const escapeField = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : String(value);
    // Untrusted gateway errors can be CSV formulas. Treat them as literal text in Excel.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const line = (cells: unknown[]) => cells.map(escapeField).join(';');

  const lines = [
    line(['Ordem', 'Lote', 'Numero/Chat ID', 'Status', 'Enviado em (ISO)', 'Codigo do erro', 'Motivo do erro', 'ID da mensagem']),
    ...batch.results.map((item, index) =>
      line([
        index + 1,
        batch.batchId,
        item.chatId,
        item.status,
        item.sentAt ?? '',
        item.error?.code ?? '',
        item.error?.message ?? '',
        item.messageId ?? '',
      ]),
    ),
    '',
    line(['Resumo do lote', 'Total', 'Enviadas', 'Falhas', 'Pendentes', 'Canceladas', 'Resultados individuais', 'Situacao']),
    line([
      batch.batchId,
      batch.progress.total,
      batch.progress.sent,
      batch.progress.failed,
      batch.progress.pending,
      batch.progress.cancelled,
      batch.results.length,
      batch.status,
    ]),
  ];

  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function batchReportFilename(batchId: string): string {
  return 'openwa-lote-' + batchId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,100) + '.csv';
}
