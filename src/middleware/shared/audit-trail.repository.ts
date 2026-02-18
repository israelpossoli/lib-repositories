import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryRunner, Repository } from "typeorm";
import { AuditTrail } from "@cargolift-cdi/types";


/**
 * Repositório para registro de audit trail de alterações em dados mestres (MDM).
 * Responsável por persistir o histórico de operações (create, update, delete) nas entidades dinâmicas.
 *
 * Suporta dois modos de operação:
 * - `register()`: INSERT independente (transação própria)
 * - `registerWithQueryRunner()`: INSERT usando QueryRunner externo (mesma transação do chamador)
 */
@Injectable()
export class AuditTrailRepository {
  private readonly logger = new Logger(AuditTrailRepository.name);

  constructor(
    @InjectRepository(AuditTrail, "mdm")
    private readonly repo: Repository<AuditTrail>,
  ) {}

  /**
   * Registra uma entrada no audit trail.
   * @param input Dados da operação a ser auditada
   * @returns O registro criado ou null em caso de falha
   */
  async register(input: Partial<AuditTrail>): Promise<AuditTrail | null> {
    try {
      const record = this.repo.create({
        entity: input.entity,
        operation: input.operation,
        correlationId: input.correlationId,
        changes: input.changes ?? null,
        agent: input.agent ?? null,
        username: input.username ?? null,
        recordId: input.recordId,
        additionalInfo: input.additionalInfo ?? null,
        changedAt: new Date(),
      });

      return await this.repo.save(record);
    } catch (err) {
      this.logger.error(
        `Falha ao registrar audit trail para entidade '${input.entity}', operação '${input.operation}': ${(err as Error).message}`,
        (err as Error).stack,
      );
      return null;
    }
  }

  /**
   * Registra uma entrada no audit trail usando um QueryRunner externo (mesma transação).
   * Usado pelo EntityDynamicRepository para garantir atomicidade entre persistência + auditoria.
   * @param queryRunner QueryRunner com transação já aberta
   * @param input Dados da operação a ser auditada
   */
  async registerWithQueryRunner(queryRunner: QueryRunner, data: Partial<AuditTrail>): Promise<void> {
    const record = this.repo.create(data);

    await queryRunner.manager.save(AuditTrail, record);
  }

  /**
   * Busca registros de audit trail por entidade e recordId.
   */
  async findByRecord(entity: string, recordId: string): Promise<AuditTrail[]> {
    return this.repo.find({
      where: { entity, recordId },
      order: { changedAt: "DESC" },
    });
  }

  /**
   * Busca registros de audit trail por correlationId.
   */
  async findByCorrelationId(correlationId: string): Promise<AuditTrail[]> {
    return this.repo.find({
      where: { correlationId },
      order: { changedAt: "DESC" },
    });
  }
}
