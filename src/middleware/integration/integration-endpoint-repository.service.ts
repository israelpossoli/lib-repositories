import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationEndpoint, IntegrationCredential } from '@cargolift-cdi/types';

@Injectable()
export class IntegrationEndpointRepository {
  constructor(
    @InjectRepository(IntegrationEndpoint, "middleware")
    private readonly repo: Repository<IntegrationEndpoint>,
    @InjectRepository(IntegrationCredential, "middleware")
    private readonly repoCredential: Repository<IntegrationCredential>,
  ) {}

  async find(agent: string, entity: string, action: string): Promise<IntegrationEndpoint | null> {
    const qb = this.repo
      .createQueryBuilder('integration_endpoint')
      .where('integration_endpoint.agent = :agent', { agent })
      .andWhere('integration_endpoint.entity = :entity', { entity })
      .andWhere('integration_endpoint.active = :active', { active: true })
      .andWhere(
        `(
          integration_endpoint.action = 'all' OR
          integration_endpoint.action = :action OR
          integration_endpoint.action LIKE :actionListPrefix OR
          integration_endpoint.action LIKE :actionListInfix OR
          integration_endpoint.action LIKE :actionListSuffix
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
          WHEN integration_endpoint.action = :action THEN 1
          WHEN integration_endpoint.action LIKE :actionListPrefix OR
               integration_endpoint.action LIKE :actionListInfix OR
               integration_endpoint.action LIKE :actionListSuffix THEN 2
          WHEN integration_endpoint.action = 'all' THEN 3
          ELSE 4
        END`,
        'ASC',
      )
      .addOrderBy('integration_endpoint.version', 'DESC');

    return await qb.getOne();
  }

  async getCredential(endpoint: IntegrationEndpoint): Promise<IntegrationCredential | null> {
    if (!endpoint?.credentialId) return null;
    return await this.repoCredential.findOne({ where: { id: endpoint.credentialId, active: true }});
  }
}
