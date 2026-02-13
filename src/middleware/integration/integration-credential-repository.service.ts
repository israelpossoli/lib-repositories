import { IntegrationCredential } from '@cargolift-cdi/types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';


@Injectable()
export class IntegrationCredentialRepository {
  constructor(
    @InjectRepository(IntegrationCredential, "middleware")
    private readonly repo: Repository<IntegrationCredential>,
  ) {}

  async find(credentialId: string): Promise<IntegrationCredential | null> {
    return await this.repo.findOne({ where: { id: credentialId, active: true }});
  }  
}
