import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RoutingOutbound } from "@cargolift-cdi/types";

@Injectable()
export class IntegrationOutboundRepository {
  constructor(
    @InjectRepository(RoutingOutbound, "middleware")
    private readonly repo: Repository<RoutingOutbound>
  ) {}

  /**
   * Busca as rotas de integração de saída (outbound) ativas para um determinado agente, entidade e ação, excluindo rotas do próprio agente de origem.
   * A busca considera as seguintes regras de correspondência para a ação:
   * - Rotas com action = 'all' correspondem a todas as ações
   * - Rotas com action = '<ação específica>' correspondem apenas àquela ação
   * - Rotas com action contendo uma lista de ações separadas por vírgula correspondem se a ação estiver na lista
   * @param agent 
   * @param entity 
   * @param action 
   * @returns 
   */
  async getRoutes(agent: string, entity: string, action: string): Promise<RoutingOutbound[]> {
    const qb = this.repo
      .createQueryBuilder("routing_outbound")
      .where("routing_outbound.agent <> :agent", { agent })
      .andWhere("routing_outbound.entity = :entity", { entity })
      .andWhere("routing_outbound.active = :active", { active: true })
      .andWhere(
        `(
          routing_outbound.action = 'all' OR
          routing_outbound.action = :action OR
          routing_outbound.action LIKE :actionListPrefix OR
          routing_outbound.action LIKE :actionListInfix OR
          routing_outbound.action LIKE :actionListSuffix
        )`,
        {
          action,
          actionListPrefix: `${action},%`,
          actionListInfix: `%,${action},%`,
          actionListSuffix: `%,${action}`,
        }
      )
      .orderBy(
        `CASE
          WHEN routing_outbound.action = :action THEN 1
          WHEN routing_outbound.action LIKE :actionListPrefix OR
               routing_outbound.action LIKE :actionListInfix OR
               routing_outbound.action LIKE :actionListSuffix THEN 2
          WHEN routing_outbound.action = 'all' THEN 3
          ELSE 4
        END`,
        "ASC"
      )
      .addOrderBy("routing_outbound.version", "DESC");

    return qb.getMany();
  }

  async find(agent: string, entity: string, action: string): Promise<RoutingOutbound | null> {
    const qb = this.repo
      .createQueryBuilder("routing_outbound")
      .where("routing_outbound.agent = :agent", { agent })
      .andWhere("routing_outbound.entity = :entity", { entity })
      .andWhere("routing_outbound.active = :active", { active: true })
      .andWhere(
        `(
          routing_outbound.action = 'all' OR
          routing_outbound.action = :action OR
          routing_outbound.action LIKE :actionListPrefix OR
          routing_outbound.action LIKE :actionListInfix OR
          routing_outbound.action LIKE :actionListSuffix
        )`,
        {
          action,
          actionListPrefix: `${action},%`,
          actionListInfix: `%,${action},%`,
          actionListSuffix: `%,${action}`,
        }
      )
      .orderBy(
        `CASE
          WHEN routing_outbound.action = :action THEN 1
          WHEN routing_outbound.action LIKE :actionListPrefix OR
               routing_outbound.action LIKE :actionListInfix OR
               routing_outbound.action LIKE :actionListSuffix THEN 2
          WHEN routing_outbound.action = 'all' THEN 3
          ELSE 4
        END`,
        "ASC"
      )
      .addOrderBy("routing_outbound.version", "DESC");

    return qb.getOne();
  }
}
