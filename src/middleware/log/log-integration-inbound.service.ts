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
      // Calcula duração do último processamento
      durationMs: data.timestampLastAttempt
        ? Date.now() - new Date(data.timestampLastAttempt).getTime()
        : undefined,
      ...data,
    };

    if (data.status === IntegrationStatus.SUCCESS || data.status === IntegrationStatus.FAILED || data.status === IntegrationStatus.DISCARTED) {
      const endTime = Date.now();

      payload.timestampEnd = new Date();
      
      // Calcula duração total desde a origem até o fim do processamento
      if (payload.timestampOriginStart) {
        payload.durationLifetime = endTime - new Date(payload.timestampOriginStart).getTime();
      }

      // Calcula duração total desde o início do processamento até o fim considerando reprocessamentos
      if (payload.timestampStart) {
        payload.durationTotal = endTime - new Date(payload.timestampStart).getTime();
      }

      // Calcula duração do último processamento
      if (payload.timestampLastAttempt) {
        payload.durationMs = endTime - new Date(payload.timestampLastAttempt).getTime();
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
