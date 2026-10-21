import type { BulkMessageItem } from '../services/api';

export type PersonalizedRow = { id: string; recipient: string; message: string };
export type BulkComposeMode = 'same' | 'personalized' | 'random';

export const MAX_BULK_VARIATIONS = 30;
export const MAX_BULK_PERSONALIZED = 100;
export const MAX_BULK_TEXT_LENGTH = 4096;
export const MAX_PERSONALIZED_CSV_BYTES = 2 * 1024 * 1024;

const CHAT_ID = /^[0-9][0-9:-]*@(c\.us|g\.us|s\.whatsapp\.net|lid|newsletter|broadcast)$/i;
const PHONE = /^\+?[0-9().\s-]+$/;

/** Reject malformed identifiers rather than silently delivering to the wrong phone. */
export function normalizePersonalizedRecipient(input: string): string {
  const value = input.trim();
  if (CHAT_ID.test(value)) return value;
  if (!PHONE.test(value)) throw new Error('invalidRecipient');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) throw new Error('invalidRecipient');
  return `${digits}@c.us`;
}

function assertText(message: string): void {
  if (!message.trim()) throw new Error('emptyMessage');
  if (Array.from(message).length > MAX_BULK_TEXT_LENGTH) throw new Error('longMessage');
}

export function buildPersonalizedBulkMessages(rows: readonly Pick<PersonalizedRow, 'recipient' | 'message'>[]): BulkMessageItem[] {
  if (!rows.length || rows.length > MAX_BULK_PERSONALIZED) throw new Error('invalidCount');
  const seen = new Set<string>();
  return rows.map(row => {
    const chatId = normalizePersonalizedRecipient(row.recipient);
    if (seen.has(chatId)) throw new Error('duplicateRecipient');
    seen.add(chatId);
    assertText(row.message);
    return { chatId, type: 'text' as const, content: { text: row.message } };
  });
}

function csvRows(input: string, delimiter: string): string[][] {
  const result: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell.length || closedQuote) throw new Error('invalidCsv');
      quoted = true;
    } else if (char === delimiter) {
      record.push(cell);
      cell = '';
      closedQuote = false;
    } else if (char === '\r' || char === '\n') {
      record.push(cell);
      if (record.some(column => column.trim())) result.push(record);
      if (result.length > MAX_BULK_PERSONALIZED + 1) throw new Error('invalidCount');
      record = [];
      cell = '';
      closedQuote = false;
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      if (closedQuote && !/\s/.test(char)) throw new Error('invalidCsv');
      cell += char;
    }
  }
  if (quoted) throw new Error('invalidCsv');
  record.push(cell);
  if (record.some(column => column.trim())) result.push(record);
  return result;
}

function detectDelimiter(firstLine: string): string {
  const options = [';', ',', '\t'];
  let winner = ';';
  let max = -1;
  for (const candidate of options) {
    let quotes = false;
    let score = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"') {
        if (quotes && firstLine[i + 1] === '"') i++;
        else quotes = !quotes;
      } else if (!quotes && firstLine[i] === candidate) {
        score++;
      }
    }
    if (score > max) {
      max = score;
      winner = candidate;
    }
  }
  return winner;
}

function headerKey(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]/g, '');
}

/** Supports Excel CSV (semicolon or comma), quoted multiline text and UTF-8 BOM. */
export function parsePersonalizedCsv(input: string): PersonalizedRow[] {
  const headerLine = input.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  const records = csvRows(input, detectDelimiter(headerLine));
  if (!records.length) throw new Error('invalidCsv');
  const fields = records[0].map(headerKey);
  const numberIndex = fields.findIndex(field => ['numero', 'telefone', 'celular', 'phone', 'number', 'destinatario', 'recipient', 'chatid'].includes(field));
  const messageIndex = fields.findIndex(field => ['mensagem', 'message', 'texto', 'text'].includes(field));
  if (numberIndex < 0 || messageIndex < 0 || numberIndex === messageIndex) throw new Error('invalidHeader');
  const rows = records.slice(1).map((record, index) => {
    if (record.length !== fields.length) throw new Error('invalidCsv');
    return { id: `csv-${index}`, recipient: record[numberIndex], message: record[messageIndex] };
  });
  buildPersonalizedBulkMessages(rows);
  return rows;
}

/** Fisher-Yates shuffle; uses a fresh cycle before reusing a variation. */
export function buildRandomizedBulkMessages(
  chatIds: readonly string[],
  drafts: readonly string[],
  random: () => number = Math.random,
): BulkMessageItem[] {
  if (!chatIds.length || chatIds.length > MAX_BULK_PERSONALIZED) throw new Error('invalidCount');
  if (drafts.length > MAX_BULK_VARIATIONS) throw new Error('invalidVariations');
  const options = drafts.map(text => text.trim()).filter(Boolean);
  if (options.length < 2) throw new Error('needVariations');
  options.forEach(assertText);
  const seen = new Set<string>();
  const recipients = chatIds.map(normalizePersonalizedRecipient);
  for (const chatId of recipients) {
    if (seen.has(chatId)) throw new Error('duplicateRecipient');
    seen.add(chatId);
  }
  let pool: number[] = [];
  let previous = -1;
  return recipients.map(chatId => {
    if (!pool.length) {
      pool = options.map((_, index) => index);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      // Do not use the same text on consecutive recipients across cycle boundaries.
      if (pool[pool.length - 1] === previous) {
        const swapIndex = pool.findIndex(index => index !== previous);
        [pool[swapIndex], pool[pool.length - 1]] = [pool[pool.length - 1], pool[swapIndex]];
      }
    }
    const index = pool.pop()!;
    previous = index;
    return { chatId, type: 'text' as const, content: { text: options[index] } };
  });
}
