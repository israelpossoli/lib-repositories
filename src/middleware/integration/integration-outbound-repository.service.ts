import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IntegrationOutbound } from "@cargolift-cdi/types";

@Injectable()
export class IntegrationOutboundRepository {
  constructor(
    @InjectRepository(IntegrationOutbound, "middleware")
    private readonly repo: Repository<IntegrationOutbound>
  ) {}

  async getRoutes(agent: string, entity: string, action: string): Promise<IntegrationOutbound[]> {
    const qb = this.repo
      .createQueryBuilder("integration_outbound")
      .where("integration_outbound.agent = :agent", { agent })
      .andWhere("integration_outbound.entity = :entity", { entity })
      .andWhere("integration_outbound.active = :active", { active: true })
      .andWhere(
        `(
          integration_outbound.action = 'all' OR
          integration_outbound.action = :action OR
          integration_outbound.action LIKE :actionListPrefix OR
          integration_outbound.action LIKE :actionListInfix OR
          integration_outbound.action LIKE :actionListSuffix
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
          WHEN integration_outbound.action = :action THEN 1
          WHEN integration_outbound.action LIKE :actionListPrefix OR
               integration_outbound.action LIKE :actionListInfix OR
               integration_outbound.action LIKE :actionListSuffix THEN 2
          WHEN integration_outbound.action = 'all' THEN 3
          ELSE 4
        END`,
        "ASC"
      )
      .addOrderBy("integration_outbound.version", "DESC");

    return qb.getMany();
  }

  async find(agent: string, entity: string, action: string): Promise<IntegrationOutbound | null> {
    const qb = this.repo
      .createQueryBuilder("integration_outbound")
      .where("integration_outbound.agent = :agent", { agent })
      .andWhere("integration_outbound.entity = :entity", { entity })
      .andWhere("integration_outbound.active = :active", { active: true })
      .andWhere(
        `(
          integration_outbound.action = 'all' OR
          integration_outbound.action = :action OR
          integration_outbound.action LIKE :actionListPrefix OR
          integration_outbound.action LIKE :actionListInfix OR
          integration_outbound.action LIKE :actionListSuffix
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
          WHEN integration_outbound.action = :action THEN 1
          WHEN integration_outbound.action LIKE :actionListPrefix OR
               integration_outbound.action LIKE :actionListInfix OR
               integration_outbound.action LIKE :actionListSuffix THEN 2
          WHEN integration_outbound.action = 'all' THEN 3
          ELSE 4
        END`,
        "ASC"
      )
      .addOrderBy("integration_outbound.version", "DESC");

    return qb.getOne();
  }
}
