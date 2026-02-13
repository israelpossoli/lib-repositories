import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationStatus, LogMdm } from '@cargolift-cdi/types';
/**
 * Repositório de log de integração de entrada (inbound).
 * Responsável por criar/atualizar registros de latência associados a um id.
 * Possibilidade de reprocessamento e auditoria.
 */
@Injectable()
export class LogMdmRepository {
  constructor(
    @InjectRepository(LogMdm, "middleware")
    private readonly repo: Repository<LogMdm>
  ) {}

  /**
   * Cria um novo registro de latência.
   * @param id
   * @param correlation_id
   * @param timestamp_start
   * @returns
   */
  async register(correlationId: string, data: Partial<LogMdm> = {}): Promise<LogMdm | null> {
    const payload = {
      correlationId,
      durationProcessMs: data.timestampStart
        ? Date.now() - new Date(data.timestampStart || "").getTime()
        : undefined,
      ...data,
    };

    if (data.status === IntegrationStatus.SUCCESS || data.status === IntegrationStatus.FAILED) {
      const endTime = Date.now();

      payload.timestampEnd = new Date();
      if (payload.timestampOriginStart) {
        payload.durationMs = endTime - new Date(payload.timestampOriginStart).getTime();
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
