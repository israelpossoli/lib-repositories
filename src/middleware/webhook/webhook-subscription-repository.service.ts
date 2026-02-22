import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookSubscription } from '@cargolift-cdi/types';

/**
 * Repositório para gerenciamento de inscrições de webhook.
 *
 * Responsável por:
 * - CRUD de inscrições
 * - Busca de inscrições ativas por evento (com suporte a wildcards)
 */
@Injectable()
export class WebhookSubscriptionRepository {
  constructor(
    @InjectRepository(WebhookSubscription, "middleware")
    private readonly repo: Repository<WebhookSubscription>
  ) {}

  /**
   * Busca todas as subscriptions ativas que correspondem ao evento.
   *
   * Lógica de matching:
   * 1. Match exato: "driver.created" → "driver.created"
   * 2. Wildcard por entidade: "driver.*" → "driver.created", "driver.updated"
   * 3. Wildcard global: "*" → qualquer evento
   *
   * @param entity Entidade do evento (ex: "driver")
   * @param action Ação do evento (ex: "created")
   */
  async findActiveByEvent(entity: string, action: string): Promise<WebhookSubscription[]> {
    const exactEvent = `${entity}.${action}`;
    const wildcardEntity = `${entity}.*`;

    return this.repo
      .createQueryBuilder("ws")
      .where("ws.is_active = :isActive", { isActive: true })
      .andWhere(
        "(ws.event = :exactEvent OR ws.event = :wildcardEntity OR ws.event = :wildcardGlobal)",
        {
          exactEvent,
          wildcardEntity,
          wildcardGlobal: "*",
        },
      )
      .getMany();
  }

  /**
   * Busca todas as subscriptions de um agente específico.
   */
  async findByAgentId(agentId: string): Promise<WebhookSubscription[]> {
    return this.repo.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Busca uma subscription por ID.
   */
  async findById(id: string): Promise<WebhookSubscription | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Cria uma nova subscription.
   */
  async create(data: Partial<WebhookSubscription>): Promise<WebhookSubscription> {
    const subscription = this.repo.create(data);
    return this.repo.save(subscription);
  }

  /**
   * Atualiza uma subscription existente.
   */
  async update(id: string, data: Partial<WebhookSubscription>): Promise<WebhookSubscription | null> {
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Desativa uma subscription (soft delete).
   */
  async deactivate(id: string): Promise<void> {
    await this.repo.update(id, { isActive: false });
  }

  /**
   * Lista todas as subscriptions ativas.
   */
  async findAllActive(): Promise<WebhookSubscription[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }
}
