import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IntegrationInbound } from "@cargolift-cdi/types";

@Injectable()
export class InboundRepositoryService {
  constructor(
    @InjectRepository(IntegrationInbound)
    private readonly repo: Repository<IntegrationInbound>
  ) {}

  async get(agent: string, entity: string, method: string): Promise<IntegrationInbound[]> {
    const qb = this.repo
      .createQueryBuilder("integration_inbound")
      .where("integration_inbound.agent = :agent", { agent })
      .andWhere("integration_inbound.entity = :entity", { entity })
      .andWhere("integration_inbound.active = :active", { active: true })
      .andWhere(
        `(
          UPPER(integration_inbound.method) = 'ALL' OR
          UPPER(integration_inbound.method) = :method OR
          UPPER(integration_inbound.method) LIKE :methodListPrefix OR
          UPPER(integration_inbound.method) LIKE :methodListInfix OR
          UPPER(integration_inbound.method) LIKE :methodListSuffix
        )`,
        {
          method: method.toUpperCase(),
          methodListPrefix: `${method.toUpperCase()},%`,
          methodListInfix: `%,${method.toUpperCase()},%`,
          methodListSuffix: `%,${method.toUpperCase()}`,
        }
      );

    const rows = await qb
      .orderBy(
        `CASE
          WHEN UPPER(integration_inbound.method) = :method THEN 1
          WHEN UPPER(integration_inbound.method) LIKE :methodListPrefix OR
               UPPER(integration_inbound.method) LIKE :methodListInfix OR
               UPPER(integration_inbound.method) LIKE :methodListSuffix THEN 2
          WHEN UPPER(integration_inbound.method) = 'ALL' THEN 3
          ELSE 4
        END`,
        "ASC"
      )
      .addOrderBy("integration_inbound.agent", "ASC")
      .addOrderBy("integration_inbound.entity", "ASC")
      .addOrderBy("integration_inbound.version", "DESC")
      .getMany();

    const resultMap = new Map<string, IntegrationInbound>();

    for (const row of rows) {
      const key = `${row.agent}::${row.entity}::${row.method.toUpperCase()}`;
      if (!resultMap.has(key)) {
        resultMap.set(key, row);
      }
    }

    return Array.from(resultMap.values());
  }

  async getFirstActive(agent: string, entity: string, method: string): Promise<IntegrationInbound | null> {
    const records = await this.get(agent, entity, method);
    return records.length > 0 ? records[0] : null;
  }
  
}
