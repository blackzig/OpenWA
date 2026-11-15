// A session-scoped ADMIN key (allowedSessions set) must not read another tenant's audit rows.
// The ApiKeyGuard fence only reads route params, so `GET /api/audit?sessionId=...` (a QUERY param)
// bypasses it — with no param at all, an unscoped findAll returns every tenant's rows. These run
// against a real in-memory DB so the scoping is exercised end-to-end, not asserted on a mock.
import { DataSource } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog, AuditAction, AuditSeverity } from './entities/audit-log.entity';

describe('AuditService session-scoped findAll', () => {
  let ds: DataSource;
  let service: AuditService;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AuditLog],
      synchronize: true,
    });
    await ds.initialize();
    const repo = ds.getRepository(AuditLog);
    service = new AuditService(repo);
    for (const sessionId of ['sessA', 'sessB']) {
      await repo.save(repo.create({ action: AuditAction.SESSION_CREATED, severity: AuditSeverity.INFO, sessionId }));
    }
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('a key scoped to sessA sees only sessA rows, never sessB', async () => {
    const { data, total } = await service.findAll({}, ['sessA']);
    expect(data.map(r => r.sessionId)).toEqual(['sessA']);
    expect(total).toBe(1);
  });

  it('a scoped key with NO sessionId param does not leak other tenants (the where={} leak)', async () => {
    const { data } = await service.findAll({}, ['sessA']);
    expect(data.every(r => r.sessionId === 'sessA')).toBe(true);
  });

  it('a scoped key requesting sessB (outside its scope) gets nothing, not sessB', async () => {
    const { data, total } = await service.findAll({ sessionId: 'sessB' }, ['sessA']);
    expect(data).toEqual([]);
    expect(total).toBe(0);
  });

  it('an unrestricted key (null allowlist) still sees all tenants', async () => {
    const { total } = await service.findAll({}, null);
    expect(total).toBe(2);
  });

  it('an unrestricted key can still narrow to a single session via the query param', async () => {
    const { data } = await service.findAll({ sessionId: 'sessB' }, null);
    expect(data.map(r => r.sessionId)).toEqual(['sessB']);
  });

  it('searches all stored rows, regardless of paging, without crossing tenant boundaries', async () => {
    const repo = ds.getRepository(AuditLog);
    await repo.save([
      repo.create({ action: AuditAction.SESSION_RESTRICTED, severity: AuditSeverity.WARN, sessionId: 'sessA',
        sessionName: 'disparopizza', errorMessage: 'Temporary LIMIT applied' }),
      repo.create({ action: AuditAction.SESSION_RESTRICTED, severity: AuditSeverity.WARN, sessionId: 'sessB',
        sessionName: 'other-tenant', errorMessage: 'Temporary LIMIT applied' }),
    ]);

    const { data, total } = await service.findAll({ search: 'limit', limit: 1 }, ['sessA']);
    expect(total).toBe(1);
    expect(data.map(row => row.sessionId)).toEqual(['sessA']);
    const byName = await service.findAll({ search: 'DISPAROPIZZA' }, ['sessA']);
    expect(byName.total).toBe(1);
    const denied = await service.findAll({ search: 'other-tenant' }, ['sessA']);
    expect(denied).toEqual({ data: [], total: 0 });
  });

  it('combines exact action, session scope, case-insensitive text and date bounds', async () => {
    const repo = ds.getRepository(AuditLog);
    await repo.save([
      repo.create({
        action: AuditAction.SESSION_RESTRICTED, severity: AuditSeverity.WARN, sessionId: 'sessA',
        createdAt: new Date('2026-11-13T16:00:00.000Z'), errorMessage: 'Temporary restriction',
      }),
      repo.create({
        action: AuditAction.SESSION_RESTRICTED, severity: AuditSeverity.WARN, sessionId: 'sessA',
        createdAt: new Date('2026-11-14T16:00:00.000Z'), errorMessage: 'Temporary restriction',
      }),
    ]);
    const { data, total } = await service.findAll({
      action: AuditAction.SESSION_RESTRICTED,
      search: 'TEMPORARY',
      from: new Date('2026-11-13T00:00:00.000Z'),
      to: new Date('2026-11-14T00:00:00.000Z'),
    }, ['sessA']);
    expect(total).toBe(1);
    expect(data[0].createdAt.toISOString()).toBe('2026-11-13T16:00:00.000Z');
  });

  it('treats SQL wildcard symbols in search text literally', async () => {
    const repo = ds.getRepository(AuditLog);
    await repo.save([
      repo.create({ action: AuditAction.MESSAGE_FAILED, severity: AuditSeverity.WARN,
        sessionId: 'sessA', errorMessage: 'Failed 100% after retry' }),
      repo.create({ action: AuditAction.MESSAGE_FAILED, severity: AuditSeverity.WARN,
        sessionId: 'sessA', errorMessage: 'Failed 100 times after retry' }),
    ]);
    const result = await service.findAll({ search: '100%' }, ['sessA']);
    expect(result.total).toBe(1);
    expect(result.data[0].errorMessage).toContain('100%');
  });
});
