import type { ChatMessage } from '../services/api';

export type OutgoingRecord = Pick<
  ChatMessage,
  'id' | 'chatId' | 'status' | 'createdAt' | 'type' | 'waMessageId'
>;

export type DeliveryCounts = Record<ChatMessage['status'], number>;

const emptyCounts = (): DeliveryCounts => ({
  pending: 0,
  sent: 0,
  delivered: 0,
  read: 0,
  failed: 0,
});

export function summarizeOutgoing(rows: readonly OutgoingRecord[]) {
  const counts = emptyCounts();
  const byRecipient = new Map<string, DeliveryCounts>();

  for (const row of rows) {
    counts[row.status] += 1;
    let recipient = byRecipient.get(row.chatId);
    if (!recipient) {
      recipient = emptyCounts();
      byRecipient.set(row.chatId, recipient);
    }
    recipient[row.status] += 1;
  }

  const recipients = Array.from(byRecipient, ([chatId, statuses]) => ({
    chatId,
    ...statuses,
    total: Object.values(statuses).reduce((a, b) => a + b, 0),
  })).sort((a, b) => a.chatId.localeCompare(b.chatId));

  return { counts, recipients, total: rows.length };
}

// Escape every field, including WhatsApp JIDs and errors, against spreadsheet formula injection.
function csvCell(value: unknown): string {
  let result = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(result)) result = "'" + result;
  return '"' + result.replace(/"/g, '""') + '"';
}

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(';');
}

export function outgoingMessageCsv(rows: readonly OutgoingRecord[], partial: boolean): string {
  const lines = [
    csvLine(['Destino/Chat ID', 'Estado', 'Data/hora (ISO)', 'Tipo', 'ID WhatsApp']),
    ...rows.map(row => csvLine([
      row.chatId, row.status, row.createdAt, row.type, row.waMessageId ?? '',
    ])),
    csvLine(['Cobertura', partial ? 'PARCIAL — limite de consulta atingido' : 'Completa para registros consultados']),
  ];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function outgoingRecipientCsv(rows: readonly OutgoingRecord[], partial: boolean): string {
  const report = summarizeOutgoing(rows);
  const lines = [
    csvLine(['Destino/Chat ID', 'Enviadas sem confirmacao', 'Entregues', 'Lidas', 'Falhas', 'Pendentes', 'Total']),
    ...report.recipients.map(row => csvLine([
      row.chatId, row.sent, row.delivered, row.read, row.failed, row.pending, row.total,
    ])),
    csvLine(['Cobertura', partial ? 'PARCIAL — limite de consulta atingido' : 'Completa para registros consultados']),
  ];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
