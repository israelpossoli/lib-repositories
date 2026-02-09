import { IntegrationCredential } from '@cargolift-cdi/types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';


@Injectable()
export class CredentialRepositoryService {
  constructor(
    @InjectRepository(IntegrationCredential)
    private readonly repo: Repository<IntegrationCredential>,
  ) {}

  async find(credentialId: string): Promise<IntegrationCredential | null> {
    return await this.repo.findOne({ where: { id: credentialId, active: true }});
  }  
}
