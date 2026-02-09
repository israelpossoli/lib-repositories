import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiagnosticLatency } from '@cargolift-cdi/types';
/**
 * Repositório de diagnóstico de latência.
 * Responsável por criar/atualizar registros de latência associados a um id.
 */
@Injectable()
export class DiagnosticLatencyRepositoryService {
  constructor(
    @InjectRepository(DiagnosticLatency)
    private readonly repo: Repository<DiagnosticLatency>
  ) {}

  /**
   * Cria um novo registro de latência.
   * @param id 
   * @param correlation_id 
   * @param timestamp_start 
   * @returns 
   */
  async create(
    correlation_id: string,
    timestamp_start: Date,
    timestamp_end: Date,
    data?: Record<string, any>
  ): Promise<DiagnosticLatency> {

    const entity = this.repo.create({
      correlationId: correlation_id,
      timestamp_start,
      timestamp_end,
      latencyMs: timestamp_end.getTime() - timestamp_start.getTime(),
      data
    });

    return this.repo.save(entity);
  }


}
