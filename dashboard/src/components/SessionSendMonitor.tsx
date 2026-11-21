import { useEffect, useRef, useState } from 'react';
import { messageApi, type ChatMessage, type Session } from '../services/api';
import {
  outgoingMessageCsv, outgoingRecipientCsv, summarizeOutgoing,
  type OutgoingRecord,
} from '../utils/sessionSendReport';
import './SessionSendMonitor.css';

type Props = { sessions: Pick<Session, 'id' | 'name'>[] };
type Report = {
  sessionId: string;
  rows: OutgoingRecord[];
  totalAtStart: number;
  partial: boolean;
};

const PAGE_SIZE = 100;
const MAX_ROWS = 1000;

/** Reads persisted records only. Does not call any send, cancel or session lifecycle endpoint. */
async function readOutgoing(sessionId: string): Promise<Report> {
  const rows: OutgoingRecord[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  let totalAtStart = 0;

  while (rows.length < MAX_ROWS) {
    const requested = Math.min(PAGE_SIZE, MAX_ROWS - rows.length);
    const page = await messageApi.listOutgoing(sessionId, requested, after);
    if (!Array.isArray(page.messages) || !Number.isFinite(page.total) || page.total < 0) {
      throw new Error('Resposta inválida do histórico de mensagens.');
    }
    if (!after) totalAtStart = page.total;
    if (page.messages.length === 0) break;

    const previousCount = rows.length;
    for (const message of page.messages) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        rows.push(message);
      }
    }
    if (rows.length === previousCount) {
      throw new Error('A paginação não avançou; a consulta foi interrompida.');
    }

    const last = page.messages[page.messages.length - 1];
    if (!last?.id || last.id === after) {
      throw new Error('Cursor de paginação inválido.');
    }
    after = last.id;
    if (page.messages.length < requested || rows.length >= totalAtStart) break;
  }

  return { sessionId, rows, totalAtStart, partial: rows.length < totalAtStart };
}

function downloadCsv(value: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SessionSendMonitor({ sessions }: Props) {
  const [sessionId, setSessionId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);

  useEffect(() => {
    if (!sessions.some(session => session.id === sessionId)) {
      setSessionId(sessions[0]?.id ?? '');
    }
  }, [sessions, sessionId]);

  useEffect(() => {
    version.current += 1;
    setReport(null);
    setError('');
    setLoading(false);
  }, [sessionId]);

  async function load() {
    if (!sessionId) return;
    const ticket = ++version.current;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const result = await readOutgoing(sessionId);
      if (ticket === version.current) setReport(result);
    } catch (cause) {
      if (ticket === version.current) {
        setError(cause instanceof Error ? cause.message : 'Falha ao consultar os envios.');
      }
    } finally {
      if (ticket === version.current) setLoading(false);
    }
  }

  const current = report?.sessionId === sessionId ? report : null;
  const summary = current ? summarizeOutgoing(current.rows) : null;
  const counts = summary?.counts;

  function exportReport(mode: 'messages' | 'recipients') {
    if (!current) return;
    const name = 'openwa-' + mode + '-' + sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36) +
      (current.partial ? '-PARCIAL' : '') + '.csv';
    const csv = mode === 'messages'
      ? outgoingMessageCsv(current.rows, current.partial)
      : outgoingRecipientCsv(current.rows, current.partial);
    downloadCsv(csv, name);
  }

  return (
    <section className="session-send-monitor" aria-label="Monitor de envios individuais">
      <div className="session-send-heading">
        <div>
          <h2>Monitor de envios por sessão</h2>
          <p>Consulta os envios registrados, mesmo quando não existe lote de disparo.</p>
        </div>
        {current && (
          <div className="session-send-actions">
            <button type="button" onClick={() => exportReport('messages')}>
              Exportar mensagens CSV
            </button>
            <button type="button" onClick={() => exportReport('recipients')}>
              Exportar destinatários CSV
            </button>
          </div>
        )}
      </div>

      <div className="session-send-controls">
        <label>
          Sessão
          <select value={sessionId} onChange={event => setSessionId(event.target.value)}>
            {sessions.length === 0 && <option value="">Nenhuma sessão cadastrada</option>}
            {sessions.map(session => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!sessionId || loading} onClick={() => void load()}>
          {loading ? 'Consultando…' : current ? 'Atualizar relatório' : 'Consultar envios'}
        </button>
      </div>

      {loading && <p role="status">Consultando histórico da sessão…</p>}
      {error && <p role="alert" className="session-send-error">{error}</p>}
      {!current && !loading && !error && (
        <p className="session-send-help">Selecione a sessão e clique em Consultar envios.</p>
      )}

      {current && summary && counts && (
        <>
          <div className="session-send-metrics">
            <div><strong>{summary.total}</strong><span>Mensagens de saída</span></div>
            <div><strong>{summary.recipients.length}</strong><span>Destinatários distintos</span></div>
            <div><strong>{counts.sent}</strong><span>Enviadas</span></div>
            <div><strong>{counts.delivered}</strong><span>Entregues</span></div>
            <div><strong>{counts.read}</strong><span>Lidas</span></div>
            <div><strong>{counts.failed}</strong><span>Falhas registradas</span></div>
            <div><strong>{counts.pending}</strong><span>Pendentes</span></div>
          </div>

          {current.partial && (
            <p role="alert" className="session-send-warning">
              Relatório parcial: {summary.total} de {current.totalAtStart} mensagens.
              A consulta está limitada a {MAX_ROWS} registros recentes; os CSVs também são parciais.
            </p>
          )}
          {summary.total === 0 ? (
            <p className="session-send-help">Não há mensagens de saída registradas nesta sessão.</p>
          ) : (
            <>
              <h3>Resultados por destinatário</h3>
              <div className="session-send-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Destinatário / Chat ID</th>
                      <th>Enviadas</th>
                      <th>Entregues</th>
                      <th>Lidas</th>
                      <th>Falhas</th>
                      <th>Pendentes</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recipients.map(recipient => (
                      <tr key={recipient.chatId}>
                        <td><code>{recipient.chatId}</code></td>
                        <td>{recipient.sent}</td>
                        <td>{recipient.delivered}</td>
                        <td>{recipient.read}</td>
                        <td>{recipient.failed}</td>
                        <td>{recipient.pending}</td>
                        <td>{recipient.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="session-send-help">
                Exibindo {summary.recipients.length} destinatário(s).
                Os dois CSVs incluem todos os registros consultados.
              </p>
            </>
          )}
          <p className="session-send-help">
            Os estados representam o último registro de cada mensagem, não são contagens acumuladas.
            “Enviada” não comprova entrega. Falhas anteriores à gravação da mensagem não constam
            deste histórico. Nenhum envio é realizado por esta tela.
          </p>
        </>
      )}
    </section>
  );
}
