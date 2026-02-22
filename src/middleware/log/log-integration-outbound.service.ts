import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationStatus, LogRoutingOutbound } from '@cargolift-cdi/types';

/**
 * Repositório para persistência de logs de integração de saída (outbound).
 *
 * Registra o histórico de chamadas HTTP realizadas pelo middleware-integration-connectors
 * para sistemas parceiros de destino.
 *
 * Segue o mesmo padrão de upsert por correlationId dos demais repositórios de log
 * (LogRoutingInboundRepository, LogMdmRepository), permitindo atualizações progressivas.
 */
@Injectable()
export class LogRoutingOutboundRepository {
  constructor(
    @InjectRepository(LogRoutingOutbound, "middleware")
    private readonly repo: Repository<LogRoutingOutbound>
  ) {}

  /**
   * Registra ou atualiza um log de integração outbound.
   * Usa upsert por correlationId para permitir atualizações progressivas
   * (ex: registrar início → atualizar com resposta → finalizar com status).
   *
   * Calcula automaticamente durações quando o status é final (success/failed/discarded).
   */
  async register(correlationId: string, data: Partial<LogRoutingOutbound> = {}): Promise<LogRoutingOutbound | null> {
    const payload: Partial<LogRoutingOutbound> = {
      correlationId,
      durationMs: data.timestampLastAttempt
        ? Date.now() - new Date(data.timestampLastAttempt).getTime()
        : undefined,
      ...data,
    };

    if (
      data.status === IntegrationStatus.SUCCESS ||
      data.status === IntegrationStatus.FAILED ||
      data.status === IntegrationStatus.DISCARTED
    ) {
      const endTime = Date.now();
      payload.timestampEnd = new Date();

      if (payload.timestampOriginStart) {
        payload.durationLifetime = endTime - new Date(payload.timestampOriginStart).getTime();
      }
      if (payload.timestampStart) {
        payload.durationRequest = endTime - new Date(payload.timestampStart).getTime();
      }
      if (payload.timestampLastAttempt) {
        payload.durationMs = endTime - new Date(payload.timestampLastAttempt).getTime();
      }
    }

    await this.repo.upsert(payload as any, ["correlationId"]);
    return this.repo.findOne({ where: { correlationId } });
  }
}
