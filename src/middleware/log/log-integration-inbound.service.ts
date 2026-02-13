import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationStatus, LogIntegrationInbound } from '@cargolift-cdi/types';
/**
 * Repositório de log de integração de entrada (inbound).
 * Responsável por criar/atualizar registros de latência associados a um id.
 * Possibilidade de reprocessamento e auditoria.
 */
@Injectable()
export class LogIntegrationInboundRepository {
  constructor(
    @InjectRepository(LogIntegrationInbound, "middleware")
    private readonly repo: Repository<LogIntegrationInbound>
  ) {}

  /**
   * Cria um novo registro de latência.
   * @param id
   * @param correlation_id
   * @param timestamp_start
   * @returns
   */
  async register(correlationId: string, data: Partial<LogIntegrationInbound> = {}): Promise<LogIntegrationInbound | null> {
    const payload = {
      correlationId,
      durationProcessMs: data.timestampProcess
        ? Date.now() - new Date(data.timestampProcess || "").getTime()
        : undefined,
      ...data,
    };

    if (data.status === IntegrationStatus.SUCCESS || data.status === IntegrationStatus.FAILED) {
      const endTime = Date.now();

      payload.timestampEnd = new Date();
      if (payload.timestampStart) {
        payload.durationMs = endTime - new Date(payload.timestampStart).getTime();
      }
    }

    await this.repo.upsert(payload, ["correlationId"]);

    return this.repo.findOne({
      where: {
        correlationId,
      },
    });
  }
}
