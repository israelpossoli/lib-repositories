import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { IntegrationAgent } from "@cargolift-cdi/types";

@Injectable()
export class IntegrationAgentRepository {
  constructor(
    @InjectRepository(IntegrationAgent, "middleware")
    private readonly repo: Repository<IntegrationAgent>
  ) {}

  async get(agent: string): Promise<IntegrationAgent | null> {
    return await this.repo.findOne({ where: { agent, active: true } });
  }

  // Busca todos os entidades ativos
  async getAllActive(): Promise<IntegrationAgent[]> {
    return await this.repo.find({ where: { active: true } });
  }

  // Busca a entidade com base no clientId do KeyCloak
  async getByApiClientId(apiClientId: string): Promise<IntegrationAgent | null> {
    return await this.repo.findOne({ where: { apiClientId, active: true } });
  }
}
