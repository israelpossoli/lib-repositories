import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MiddlewareAgentEndpoint, IntegrationCredential } from '@cargolift-cdi/types';

@Injectable()
export class IntegrationEndpointRepository {
  constructor(
    @InjectRepository(MiddlewareAgentEndpoint, "middleware")
    private readonly repo: Repository<MiddlewareAgentEndpoint>,
    @InjectRepository(IntegrationCredential, "middleware")
    private readonly repoCredential: Repository<IntegrationCredential>,
  ) {}

  async find(agent: string, entity: string, action: string): Promise<MiddlewareAgentEndpoint | null> {
    const qb = this.repo
      .createQueryBuilder('agent_endpoint')
      .where('agent_endpoint.agent = :agent', { agent })
      .andWhere('agent_endpoint.entity = :entity', { entity })
      .andWhere('agent_endpoint.active = :active', { active: true })
      .andWhere(
        `(
          agent_endpoint.action = 'all' OR
          agent_endpoint.action = :action OR
          agent_endpoint.action LIKE :actionListPrefix OR
          agent_endpoint.action LIKE :actionListInfix OR
          agent_endpoint.action LIKE :actionListSuffix
        )`,
        {
          action,
          actionListPrefix: `${action},%`,
          actionListInfix: `%,${action},%`,
          actionListSuffix: `%,${action}`,
        },
      )
      .orderBy(
        `CASE
          WHEN agent_endpoint.action = :action THEN 1
          WHEN agent_endpoint.action LIKE :actionListPrefix OR
               agent_endpoint.action LIKE :actionListInfix OR
               agent_endpoint.action LIKE :actionListSuffix THEN 2
          WHEN agent_endpoint.action = 'all' THEN 3
          ELSE 4
        END`,
        'ASC',
      )
      .addOrderBy('agent_endpoint.version', 'DESC');

    return await qb.getOne();
  }

  async getCredential(endpoint: MiddlewareAgentEndpoint): Promise<IntegrationCredential | null> {
    if (!endpoint?.credentialId) return null;
    return await this.repoCredential.findOne({ where: { id: endpoint.credentialId, active: true }});
  }
}
