import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IntegrationEntity } from "@cargolift-cdi/types";

@Injectable()
export class IntegrationEntityRepository {
  constructor(
    @InjectRepository(IntegrationEntity, "middleware")
    private readonly repo: Repository<IntegrationEntity>
  ) {}

  async getFirstActive(entity: string): Promise<IntegrationEntity | null> {
    return await this.repo.findOne({ where: { entity, active: true }, order: { version: "DESC" } });
  }

  // Busca todos os entityos ativos
  async getAllActive(): Promise<IntegrationEntity[]> {
    return await this.repo.find({ where: { active: true } });
  }

  // Busca todos os entityos ativos
  async getAllActiveByRoutingMode(routingMode: IntegrationEntity["routingMode"]): Promise<IntegrationEntity[]> {
    return await this.repo.find({ where: { active: true, routingMode } });
  }
}
