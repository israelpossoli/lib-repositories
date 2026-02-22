import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationStatus, IntegrationTracking, TrackingCurrentStep, TrackingStep } from '@cargolift-cdi/types';

/**
 * Repositório para gerenciamento do rastreamento end-to-end de requisições.
 *
 * Responsável por:
 * - Criar o registro de tracking no início do pipeline (API Hub)
 * - Adicionar steps conforme cada serviço processa a mensagem (append atômico no JSONB)
 * - Atualizar status agregado e step atual
 * - Completar o tracking ao final do pipeline
 * - Consultar por correlationId (API REST para sistemas parceiros)
 */
@Injectable()
export class IntegrationTrackingRepository {
  constructor(
    @InjectRepository(IntegrationTracking, "middleware")
    private readonly repo: Repository<IntegrationTracking>
  ) {}

  /**
   * Cria o registro de tracking no início do pipeline.
   * Chamado pelo API Hub ao receber a requisição.
   */
  async createTracking(data: {
    correlationId: string;
    agent: string;
    entity: string;
    action: string;
    timestampOriginStart?: Date | string;
    businessKey?: Record<string, any> | null;
    externalReference?: Record<string, any> | null;
    initialStep: TrackingStep;
  }): Promise<IntegrationTracking | null> {
    const tracking = this.repo.create({
      correlationId: data.correlationId,
      agent: data.agent,
      entity: data.entity,
      action: data.action,
      businessKey: data.businessKey,
      externalReference: data.externalReference,
      timestampOriginStart: data.timestampOriginStart,
      status: IntegrationStatus.PENDING,
      currentStep: TrackingCurrentStep.RECEIVED,
      steps: [data.initialStep],
      webhookDelivered: false,
      retentionPolicy: 'long',
    });

    const saved = await this.repo.save(tracking);
    return saved;
  }

  /**
   * Adiciona um step ao tracking existente usando append atômico no JSONB.
   * Atualiza simultaneamente o currentStep e o status agregado.
   *
   * Usa UPDATE direto com `steps = steps || $1::jsonb` para evitar race conditions
   * quando múltiplos serviços atualizam o mesmo tracking concorrentemente.
   */
  async addStep(
    correlationId: string,
    step: TrackingStep,
    currentStep: TrackingCurrentStep,
    status?: IntegrationStatus,
    statusReason?: string | null,
  ): Promise<void> {
    const updateFields: Record<string, any> = {
      currentStep,
    };

    if (status) {
      updateFields.status = status;
    }
    if (statusReason !== undefined) {
      updateFields.statusReason = statusReason;
    }

    // Preenche timestampStart se não informado
    const resolvedStep = { ...step, timestampStart: step.timestampStart || new Date().toISOString() };

    // Append atômico do step no array JSONB + atualização dos campos escalares
    await this.repo
      .createQueryBuilder()
      .update(IntegrationTracking)
      .set({
        ...updateFields,
        steps: () => `steps || '${JSON.stringify([resolvedStep])}'::jsonb`,
      })
      .where("correlation_id = :correlationId", { correlationId })
      .execute();
  }

  /**
   * Adiciona um step e simultaneamente atualiza businessKey, externalReference e/ou routingMode.
   * Útil quando esses dados só ficam disponíveis em steps posteriores do pipeline (ex: ESB).
   */
  async addStepWithMetadata(
    correlationId: string,
    step: TrackingStep,
    currentStep: TrackingCurrentStep,
    metadata: {
      status?: IntegrationStatus;
      statusReason?: string | null;
      businessKey?: Record<string, any> | null;
      externalReference?: Record<string, any> | null;
      routingMode?: string | null;
    },
  ): Promise<void> {
    const updateFields: Record<string, any> = {
      currentStep,
    };

    if (metadata.status) updateFields.status = metadata.status;
    if (metadata.statusReason !== undefined) updateFields.statusReason = metadata.statusReason;
    if (metadata.businessKey !== undefined) updateFields.businessKey = metadata.businessKey;
    if (metadata.externalReference !== undefined) updateFields.externalReference = metadata.externalReference;
    if (metadata.routingMode !== undefined) updateFields.routingMode = metadata.routingMode;

    const resolvedStep = { ...step, timestampStart: step.timestampStart || new Date().toISOString() };

    await this.repo
      .createQueryBuilder()
      .update(IntegrationTracking)
      .set({
        ...updateFields,
        steps: () => `steps || '${JSON.stringify([resolvedStep])}'::jsonb`,
      })
      .where("correlation_id = :correlationId", { correlationId })
      .execute();
  }

  /**
   * Completa o tracking ao final do pipeline.
   * Calcula a duração total end-to-end e marca o status definitivo.
   */
  async completeTracking(
    correlationId: string,
    finalStatus: IntegrationStatus,
    statusReason?: string | null,
    finalStep?: TrackingStep,
  ): Promise<void> {
    const now = new Date();

    let resolvedStep: TrackingCurrentStep;
    if (finalStatus === IntegrationStatus.SUCCESS) {
      resolvedStep = TrackingCurrentStep.COMPLETED;
    } else if (finalStatus === IntegrationStatus.DISCARTED) {
      resolvedStep = TrackingCurrentStep.DISCARDED;
    } else {
      resolvedStep = TrackingCurrentStep.FAILED;
    }

    const updateSet: Record<string, any> = {
      status: finalStatus,
      timestampEnd: now,
      currentStep: resolvedStep,
    };

    if (statusReason !== undefined) {
      updateSet.statusReason = statusReason;
    }

    const qb = this.repo
      .createQueryBuilder()
      .update(IntegrationTracking)
      .set(updateSet)
      .where("correlation_id = :correlationId", { correlationId });

    // Se tiver step final, faz set com append JSONB + cálculo da duração
    if (finalStep) {
      const resolvedFinalStep = { ...finalStep, timestampStart: finalStep.timestampStart || new Date().toISOString() };
      qb.set({
        ...updateSet,
        steps: () => `steps || '${JSON.stringify([resolvedFinalStep])}'::jsonb`,
        durationLifetimeMs: () =>
          `EXTRACT(EPOCH FROM (NOW() - timestamp_origin_start)) * 1000`,
      });
    } else {
      qb.set({
        ...updateSet,
        durationLifetimeMs: () =>
          `EXTRACT(EPOCH FROM (NOW() - timestamp_origin_start)) * 1000`,
      });
    }

    await qb.execute();
  }

  /**
   * Marca o tracking como webhook entregue.
   */
  async markWebhookDelivered(correlationId: string): Promise<void> {
    await this.repo.update(
      { correlationId },
      { webhookDelivered: true, webhookDeliveredAt: new Date() },
    );
  }

  /**
   * Busca tracking pelo correlationId.
   * Endpoint principal para consulta de sistemas parceiros via API REST.
   */
  async findByCorrelationId(correlationId: string): Promise<IntegrationTracking | null> {
    return this.repo.findOne({ where: { correlationId } });
  }

  /**
   * Busca trackings pendentes de webhook para disparo.
   * Retorna trackings que estão em status final (success/failed/discarded)
   * mas ainda não tiveram webhook entregue.
   */
  async findPendingWebhookDelivery(limit: number = 100): Promise<IntegrationTracking[]> {
    return this.repo.find({
      where: [
        { status: IntegrationStatus.SUCCESS, webhookDelivered: false },
        { status: IntegrationStatus.FAILED, webhookDelivered: false },
        { status: IntegrationStatus.DISCARTED, webhookDelivered: false },
      ],
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }
}
