import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RoutingInbound } from "@cargolift-cdi/types";

@Injectable()
export class IntegrationInboundRepository {
  constructor(
    @InjectRepository(RoutingInbound, "middleware")
    private readonly repo: Repository<RoutingInbound>
  ) {}

  async get(agent: string, entity: string, method: string): Promise<RoutingInbound[]> {
    const qb = this.repo
      .createQueryBuilder("routing_inbound")
      .where("routing_inbound.agent = :agent", { agent })
      .andWhere("routing_inbound.entity = :entity", { entity })
      .andWhere("routing_inbound.active = :active", { active: true })
      .andWhere(
        `(
          UPPER(routing_inbound.method) = 'ALL' OR
          UPPER(routing_inbound.method) = :method OR
          UPPER(routing_inbound.method) LIKE :methodListPrefix OR
          UPPER(routing_inbound.method) LIKE :methodListInfix OR
          UPPER(routing_inbound.method) LIKE :methodListSuffix
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
          WHEN UPPER(routing_inbound.method) = :method THEN 1
          WHEN UPPER(routing_inbound.method) LIKE :methodListPrefix OR
               UPPER(routing_inbound.method) LIKE :methodListInfix OR
               UPPER(routing_inbound.method) LIKE :methodListSuffix THEN 2
          WHEN UPPER(routing_inbound.method) = 'ALL' THEN 3
          ELSE 4
        END`,
        "ASC"
      )
      .addOrderBy("routing_inbound.agent", "ASC")
      .addOrderBy("routing_inbound.entity", "ASC")
      .addOrderBy("routing_inbound.version", "DESC")
      .getMany();

    const resultMap = new Map<string, RoutingInbound>();

    for (const row of rows) {
      const key = `${row.agent}::${row.entity}::${row.method.toUpperCase()}`;
      if (!resultMap.has(key)) {
        resultMap.set(key, row);
      }
    }

    return Array.from(resultMap.values());
  }

  async getFirstActive(agent: string, entity: string, method: string): Promise<RoutingInbound | null> {
    const records = await this.get(agent, entity, method);
    return records.length > 0 ? records[0] : null;
  }
  
}
