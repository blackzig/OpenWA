import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, RefreshCw } from 'lucide-react';
import { messageApi, type BatchStatusResponse, type Session } from '../services/api';
import { batchReportFilename, buildBatchResultsCsv } from '../utils/bulkBatchReport';
import './BulkBatchResults.css';

type ResultFilter = 'all' | 'sent' | 'failed' | 'cancelled' | 'pending';

const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
const labels: Record<string, string> = {
  sent: 'Enviada (aceita pela API)',
  failed: 'Falha',
  cancelled: 'Cancelada',
  pending: 'Pendente',
};

interface Props {
  activeBatch: BatchStatusResponse | null;
  sessions: Pick<Session, 'id' | 'name'>[];
}

/** Reports only server-recorded results; no message is sent or retried by this component. */
export function BulkBatchResults({ activeBatch, sessions }: Props) {
  const [sessionId, setSessionId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [lookup, setLookup] = useState<{ sessionId: string; batchId: string } | null>(null);
  const [historic, setHistoric] = useState<BatchStatusResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ResultFilter>('all');

  useEffect(() => {
    if (!sessionId && sessions.length > 0) setSessionId(sessions[0].id);
  }, [sessions, sessionId]);

  // Historical lookups work even for a disconnected session. A running batch is polled
  // until terminal, without persisting phone numbers or API credentials in browser storage.
  useEffect(() => {
    if (!lookup) return;
    let alive = true;
    let inFlight = false;
    setHistoric(null);
    setLoading(true);
    setError('');

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await messageApi.getBatchStatus(lookup.sessionId, lookup.batchId);
        if (!alive) return;
        setHistoric(next);
        setError('');
        if (terminalStatuses.has(next.status)) clearInterval(timer);
      } catch (cause) {
        if (!alive) return;
        const status = (cause as { status?: number }).status;
        setError(cause instanceof Error ? cause.message : 'Falha ao consultar lote');
        if ((status === 403 || status === 404)) clearInterval(timer);
      } finally {
        inFlight = false;
        if (alive) setLoading(false);
      }
    };
    const timer = setInterval(() => void refresh(), 2000);
    void refresh();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [lookup]);

  const batch = lookup ? historic : activeBatch;
  const rows = (batch?.results ?? []).filter(item => filter === 'all' || item.status === filter);

  const handleLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = batchId.trim();
    if (!sessionId || !trimmed) return;
    setFilter('all');
    setLookup({ sessionId, batchId: trimmed });
  };

  const handleExport = () => {
    if (!batch) return;
    const csv = buildBatchResultsCsv(batch);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = batchReportFilename(batch.batchId);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="bulk-results-panel" aria-label="Relatório de envios em lote">
      <header className="bulk-results-header">
        <div>
          <h2>Resultados por destinatário</h2>
          <p>Consulte envios, falhas e seus motivos. A tabela acompanha o lote em andamento.</p>
        </div>
        {batch && (
          <button type="button" className="bulk-results-action" onClick={handleExport}>
            <Download size={16} aria-hidden="true" /> Exportar CSV
          </button>
        )}
      </header>

      <form className="bulk-results-lookup" onSubmit={handleLookup}>
        <label>
          Sessão do histórico
          <select value={sessionId} onChange={event => setSessionId(event.target.value)} required>
            <option value="">Selecione a sessão</option>
            {sessions.map(item => (
              <option key={item.id} value={item.id}>
                {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <span className="bulk-results-session-label">
            {sessions.find(item => item.id === sessionId)?.name ?? ''}
          </span>
        </label>
        <label>
          ID do lote anterior
          <input
            value={batchId}
            onChange={event => setBatchId(event.target.value)}
            placeholder="batch_..."
            maxLength={128}
          />
        </label>
        <button className="bulk-results-action" type="submit" disabled={!sessionId || !batchId.trim()}>
          <RefreshCw size={16} aria-hidden="true" /> Consultar
        </button>
        {lookup && (
          <button
            className="bulk-results-action"
            type="button"
            onClick={() => {
              setLookup(null);
              setHistoric(null);
              setError('');
              setFilter('all');
            }}
          >
            Voltar ao lote atual
          </button>
        )}
      </form>

      {loading && !batch && <p role="status">Consultando resultados do lote...</p>}
      {error && <p role="alert" className="bulk-results-error">{error}</p>}

      {batch ? (
        <>
          {batch.awaitingReconnect && (
            <p className="bulk-results-waiting" role="status">
              Sessão desconectada: disparos pausados. Aguardando reconexão automática. Caso seja necessário,
              acesse <Link to="/sessions">Sessões</Link> para ler um novo QR Code. Não reenvie o lote.
            </p>
          )}
          <div className="bulk-results-summary">
            <span><strong>{batch.progress.total}</strong> total</span>
            <span><strong>{batch.progress.sent}</strong> enviadas</span>
            <span><strong>{batch.progress.failed}</strong> falhas</span>
            <span><strong>{batch.progress.pending}</strong> pendentes</span>
            <span><strong>{batch.progress.cancelled}</strong> canceladas</span>
            <span>Estado: <strong>{batch.status}</strong></span>
          </div>
          <p className="bulk-results-id">Lote: <code>{batch.batchId}</code></p>
          <div className="bulk-results-filters">
            <label htmlFor="bulk-report-filter">Filtrar resultados</label>
            <select
              id="bulk-report-filter"
              value={filter}
              onChange={event => setFilter(event.target.value as ResultFilter)}
            >
              <option value="all">Todos os processados</option>
              <option value="sent">Enviadas</option>
              <option value="failed">Falhas</option>
              <option value="pending">Pendentes com registro</option>
              <option value="cancelled">Canceladas com registro</option>
            </select>
            <span>{rows.length} resultado(s) exibido(s)</span>
          </div>
          <div className="bulk-results-scroll">
            <table className="bulk-results-table">
              <thead>
                <tr>
                  <th scope="col">Ordem</th>
                  <th scope="col">Número / Chat ID</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Data / hora</th>
                  <th scope="col">Motivo da falha</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) => (
                  <tr key={item.chatId + ':' + index}>
                    <td>{batch.results.indexOf(item) + 1}</td>
                    <td><code>{item.chatId}</code></td>
                    <td><span className={'bulk-result-status bulk-result-' + item.status}>{labels[item.status] ?? item.status}</span></td>
                    <td>{item.sentAt ? new Date(item.sentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</td>
                    <td title={item.error?.message ?? ''}>
                      {item.error ? item.error.code + ': ' + item.error.message : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="bulk-results-empty">Nenhum resultado individual para esse filtro.</p>}
          </div>
          <p className="bulk-results-note">
            “Enviada” significa aceita pelo mecanismo de envio; não comprova entrega ou leitura no WhatsApp.
            Mensagens ainda pendentes ou canceladas sem tentativa aparecem nos totais, mas não têm linha individual na API.
          </p>
        </>
      ) : (
        !loading && !error && (
          <p className="bulk-results-empty">
            Inicie um lote ou consulte um lote anterior pelo ID para ver os números e baixar o relatório.
          </p>
        )
      )}
    </section>
  );
}
