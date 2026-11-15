import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuditListResponseDto } from './dto/audit-response.dto';
import { AuditService, AuditQueryOptions } from './audit.service';
import { AuditLog, AuditAction, AuditSeverity } from './entities/audit-log.entity';
import { RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';

/** Accept only normalized UTC ISO timestamps, so an ambiguous date cannot silently shift a day. */
function auditTimestamp(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value)) {
    throw new BadRequestException(`${field} must be a UTC ISO-8601 timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new BadRequestException(`${field} must be a valid UTC ISO-8601 timestamp`);
  }
  return parsed;
}

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'List audit logs with optional filters' })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({
    name: 'severity',
    required: false,
    enum: AuditSeverity,
    description: '`error` is reserved: nothing writes it, so that filter returns no rows.',
  })
  @ApiQuery({ name: 'sessionId', required: false })
  @ApiQuery({ name: 'apiKeyId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: 'integer' })
  @ApiQuery({ name: 'offset', required: false, type: 'integer' })
  @ApiQuery({ name: 'search', required: false, type: 'string', description: 'Case-insensitive text search across the full audit history' })
  @ApiQuery({ name: 'from', required: false, type: 'string', description: 'Inclusive UTC ISO-8601 timestamp' })
  @ApiQuery({ name: 'to', required: false, type: 'string', description: 'Exclusive UTC ISO-8601 timestamp' })
  @ApiResponse({ status: 200, description: 'Paginated list of audit logs', type: AuditListResponseDto })
  @ApiResponse({ status: 400, description: 'action or severity is repeated or not one of the listed values' })
  async findAll(
    @CurrentApiKey() apiKey?: ApiKey,
    @Query('action') action?: AuditAction | AuditAction[],
    @Query('severity') severity?: AuditSeverity | AuditSeverity[],
    @Query('sessionId') sessionId?: string,
    @Query('apiKeyId') apiKeyId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ data: AuditLog[]; total: number }> {
    // The global pipe leaves these enum-typed params alone, so ?action=a&action=b arrives as an array,
    // which the driver rejects as a 500, and an unknown value would silently match nothing. An empty
    // value still means no filter.
    if (action && !(Object.values(AuditAction) as unknown[]).includes(action)) {
      throw new BadRequestException('action must be a single value from the AuditAction list');
    }
    if (severity && !(Object.values(AuditSeverity) as unknown[]).includes(severity)) {
      throw new BadRequestException(
        `severity must be a single value, one of: ${Object.values(AuditSeverity).join(', ')}`,
      );
    }
    const options: AuditQueryOptions = {};
    if (action) options.action = action as AuditAction;
    if (severity) options.severity = severity as AuditSeverity;
    if (sessionId) options.sessionId = sessionId;
    if (apiKeyId) options.apiKeyId = apiKeyId;
    if (limit) options.limit = parseInt(limit, 10);
    if (offset) options.offset = parseInt(offset, 10);
    if (search !== undefined) {
      if (typeof search !== 'string' || search.length > 120) {
        throw new BadRequestException('search must be a single string of at most 120 characters');
      }
      if (search.trim()) options.search = search.trim();
    }
    if (from !== undefined) options.from = auditTimestamp(from, 'from');
    if (to !== undefined) options.to = auditTimestamp(to, 'to');
    if (options.from && options.to && options.from >= options.to) {
      throw new BadRequestException('from must precede to');
    }

    // Scope to the calling key's allowedSessions so a session-restricted ADMIN key cannot read
    // another tenant's audit rows via the `sessionId` query param (which bypasses the guard fence).
    return this.auditService.findAll(options, apiKey?.allowedSessions);
  }
}
