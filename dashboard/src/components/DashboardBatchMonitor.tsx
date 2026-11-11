import { useEffect, useMemo, useState } from 'react';
import { messageApi, type BatchSummary, type Session } from '../services/api';
import './DashboardBatchMonitor.css';

type Props = { sessions: Pick<Session, 'id' | 'name'>[] };

const names: Record<BatchSummary['status'], string> = {
  pending: 'Aguardando',
  processing: 'Processamento ativo',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  failed: 'Interrompido por falha',
};

export function DashboardBatchMonitor({ sessions }: Props) {
  const [sessionId, setSessionId] = useState('');
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [batchId, setBatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const session = sessions.find(value => value.id === sessionId);
  const selected = useMemo(
    () => summaries.find(value => value.batchId === batchId) ?? summaries[0],
    [summaries, batchId],
  );

  useEffect(() => {
    if (!sessions.some(value => value.id === sessionId)) {
      setSessionId(sessions[0]?.id ?? '');
    }
  }, [sessions, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let reading = false;
    setSummaries([]);
    setBatchId('');
    setError('');
    setLoading(true);

    const read = async () => {
      if (reading) return;
      reading = true;
      try {
        const results = await messageApi.listRecentBatches(sessionId);
        if (!active) return;
        setSummaries(results);
        setError('');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os lotes.');
      } finally {
        reading = false;
        if (active) setLoading(false);
      }
    };

    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  const total = selected?.progress.total ?? 0;
  const sent = selected?.progress.sent ?? 0;
  const failed = selected?.progress.failed ?? 0;
  const pending = selected?.progress.pending ?? 0;
  const cancelled = selected?.progress.cancelled ?? 0;
  const progress = total > 0 ? Math.min(100, Math.round(((sent + failed + cancelled) / total) * 1000) / 10) : 0;
  const updated = selected?.updatedAt
    ? new Date(selected.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—';

  return (
    <section className="dashboard-batch-monitor" aria-label="Acompanhamento dos envios em lote">
      <div className="dashboard-batch-head">
        <div>
          <h2>Acompanhamento dos envios em lote</h2>
          <p>Dados do servidor atualizados automaticamente a cada 5 segundos.</p>
        </div>
        {selected && <span className={'dashboard-batch-state state-' + selected.status}>{names[selected.status]}</span>}
      </div>
      <div className="dashboard-batch-controls">
        <label>
          Sessão
          <select value={sessionId} onChange={event => setSessionId(event.target.value)}>
            {sessions.length === 0 && <option value="">Nenhuma sessão disponível</option>}
            {sessions.map(item => <option key={item.id} value={item.id}>{item.id.slice(0, 12)}</option>)}
          </select>
        </label>
        {summaries.length > 0 && (
          <label>
            Lote
            <select value={selected?.batchId ?? ''} onChange={event => setBatchId(event.target.value)}>
              {summaries.map(item => (
                <option key={item.batchId} value={item.batchId}>
                  {item.batchId} — {names[item.status]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {session && <p className="dashboard-batch-id">Sessão selecionada: {session.name}</p>}
      {loading && !selected && <p role="status">Consultando os lotes desta sessão...</p>}
      {error && <p role="alert" className="dashboard-batch-error">{error}</p>}
      {!selected && !loading && !error && (
        <p className="dashboard-batch-empty">
          {session ? 'Nenhum lote registrado nesta sessão.' : 'Selecione uma sessão para consultar os lotes.'}
        </p>
      )}
      {selected && (
        <>
          <div className="dashboard-batch-id">Lote <code>{selected.batchId}</code></div>
          <div className="dashboard-batch-metrics">
            <div><strong>{total}</strong><span>Total</span></div>
            <div><strong>{sent}</strong><span>Enviadas</span></div>
            <div><strong>{failed}</strong><span>Falhas</span></div>
            <div><strong>{pending}</strong><span>Pendentes</span></div>
            {cancelled > 0 && <div><strong>{cancelled}</strong><span>Canceladas</span></div>}
          </div>
          <div
            className="dashboard-batch-track"
            role="progressbar"
            aria-label="Percentual de mensagens processadas"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="dashboard-batch-fill" style={{ width: progress + '%' }} />
          </div>
          <p className="dashboard-batch-foot">
            {progress.toLocaleString('pt-BR')}% processado. Última atualização: {updated} (horário de Brasília).
          </p>
          <p className="dashboard-batch-disclaimer">
            “Enviada” é o resultado registrado pela API; não é confirmação de entrega ou leitura no WhatsApp.
          </p>
        </>
      )}
    </section>
  );
}
