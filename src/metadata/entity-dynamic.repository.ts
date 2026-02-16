import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryRunner } from "typeorm";
import { FieldMetadata, IntegrationEntity } from "@cargolift-cdi/types";
import { IntegrationEntityRepository } from "../middleware/integration/integration-entity-repository.service.js";

export interface EntityDynamicSaveResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  errorDetails?: unknown;
}

export interface EntityDynamicDeleteResult {
  success: boolean;
  affected?: number;
  error?: string;
  errorDetails?: unknown;
}

@Injectable()
export class EntityDynamicRepository {
  // private readonly logger = new Logger(EntityDynamicRepository.name);

  private static readonly IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

  constructor(
    @InjectDataSource("mdm") private readonly mdmDs: DataSource,
    private readonly integrationEntityRepository: IntegrationEntityRepository,
  ) {}

  // ──────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────

  async exists(entity: string, filters: Record<string, unknown>): Promise<boolean> {
    const result = await this.findOne(entity, filters);
    return !!result;
  }

  async find(entity: string, filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const sanitizedEntity = this.sanitizeIdentifier(entity);
    const keys = Object.keys(filters);
    const values = Object.values(filters);

    let sql = `SELECT * FROM ${sanitizedEntity} WHERE 1=1`;

    keys.forEach((key, idx) => {
      sql += ` AND ${this.sanitizeIdentifier(key)} = $${idx + 1}`;
    });

    return this.mdmDs.query(sql, values);
  }

  async findOne(entity: string, filters: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const results = await this.find(entity, filters);
    return results[0] ?? null;
  }

  // ──────────────────────────────────────────────
  // Persistência
  // ──────────────────────────────────────────────

  async save(
    entity: string,
    action: "create" | "update" | "upsert",
    data: Record<string, unknown>,
    entityData: IntegrationEntity,
    businessKeyValues?: Record<string, any>,
  ): Promise<EntityDynamicSaveResult> {
    const validation = this.validateEntityForSave(entity, action, entityData);
    if (validation) {
      return validation;
    }

    const table = entity;
    const businessKeys: string[] = entityData?.metadados?.storage?.businessKey ?? [];
    const editableFields = this.getEditableFields(entityData);

    if (editableFields.length === 0) {
      return { success: false, error: `Nenhum campo editável definido para a entidade: ${entity}` };
    }

    if ((action === "update" || action === "upsert") && (!businessKeyValues || Object.keys(businessKeyValues).length === 0)) {
      return { success: false, error: `Valores das chaves de negócio (businessKeyValues) são obrigatórios para ${action}` };
    }

    const editableValues = editableFields.map((f) => data?.[f] ?? null);
    const { sql, params } = this.buildSql(action, table, editableFields, businessKeys, editableValues, businessKeyValues ?? {});

    if (!sql) {
      return { success: false, error: `Nenhum campo a atualizar para a entidade: ${entity}` };
    }

    return this.executeInTransaction(async (queryRunner) => {
      const result = await queryRunner.query(sql, params);

      // PostgreSQL via TypeORM retorna [rows[], rowCount]
      const rows = Array.isArray(result?.[0]) ? result[0] as Record<string, unknown>[] : [];
      const affectedCount = typeof result?.[1] === "number" ? result[1] : rows.length;

      if ((action === "update" || action === "upsert") && affectedCount === 0) {
        return { success: false, error: `Nenhum registro encontrado para ${action === "update" ? "atualizar" : "inserir/atualizar"}`, affected: 0, errorDetails: { sql, params} };
      }

      return { success: true, data: rows[0] ?? null };
    });
  }

  async delete(
    entity: string,
    entityData: IntegrationEntity,
    businessKeyValues: Record<string, unknown>,
  ): Promise<EntityDynamicDeleteResult> {
    const entityRecord = entityData ?? await this.integrationEntityRepository.getFirstActive(entity);
    if (!entityRecord) {
      return { success: false, error: `Entidade não encontrada: ${entity}` };
    }

    if (!entityRecord.metadados?.storage?.table) {
      return { success: false, error: `Tabela de armazenamento não definida para a entidade: ${entity}` };
    }

    const businessKeys: string[] = entityRecord.metadados.storage.businessKey ?? [];
    if (businessKeys.length === 0) {
      return { success: false, error: "Chave de negócio não definida para a entidade" };
    }

    if (!businessKeyValues || Object.keys(businessKeyValues).length === 0) {
      return { success: false, error: "Valores das chaves de negócio (businessKeyValues) são obrigatórios para exclusão" };
    }

    const table = entityRecord.metadados.storage.table;
    const sanitizedTable = this.sanitizeIdentifier(table);

    const whereKeys = businessKeys.filter((k) => businessKeyValues[k] !== undefined);
    if (whereKeys.length === 0) {
      return { success: false, error: "Nenhum valor válido de chave de negócio informado para exclusão" };
    }

    const values = whereKeys.map((k) => businessKeyValues[k]);
    const whereClause = whereKeys
      .map((key, idx) => `${this.sanitizeIdentifier(key)} = $${idx + 1}`)
      .join(" AND ");

    const sql = `DELETE FROM ${sanitizedTable} WHERE ${whereClause}`;

    return this.executeInTransaction(async (queryRunner) => {
      const result = await queryRunner.query(sql, values);

      // PostgreSQL via TypeORM retorna [rows[], rowCount]
      const affected = typeof result?.[1] === "number" ? result[1] : 0;

      if (affected === 0) {
        return { success: false, affected: 0, error: "Nenhum registro encontrado para excluir", errorDetails: { sql, params: values } };
      }

      return { success: true, affected };
    });
  }

  // ──────────────────────────────────────────────
  // Validações
  // ──────────────────────────────────────────────

  private validateEntityForSave(
    entity: string,
    action: "create" | "update" | "upsert",
    entityData: IntegrationEntity,
  ): EntityDynamicSaveResult | null {
    if (!entityData) {
      return { success: false, error: `Entidade não encontrada: ${entity}` };
    }

    if (!entityData.metadados?.storage?.table) {
      return { success: false, error: `Tabela de armazenamento não definida para a entidade: ${entity}` };
    }

    if (!entityData.metadados?.fields || entityData.metadados.fields.length === 0) {
      return { success: false, error: `Nenhum campo definido para a entidade: ${entity}` };
    }

    const businessKeys: string[] = entityData.metadados.storage.businessKey ?? [];

    if ((action === "update" || action === "upsert") && businessKeys.length === 0) {
      return { success: false, error: "Chave de negócio não definida para a entidade" };
    }

    return null;
  }

  private getEditableFields(entityData: IntegrationEntity): string[] {
    return entityData?.metadados?.fields?.filter((f: FieldMetadata) => !f.schema?.readonly).map((f: FieldMetadata) => f.field) ?? [];
  }

  // ──────────────────────────────────────────────
  // Construção de SQL
  // ──────────────────────────────────────────────

  private buildSql(
    action: "create" | "update" | "upsert",
    table: string,
    editableFields: string[],
    businessKeys: string[],
    editableValues: unknown[],
    businessKeyValues: Record<string, unknown>,
  ): { sql: string; params: unknown[] } {
    const sanitizedTable = this.sanitizeIdentifier(table);
    const sanitizedColumns = editableFields.map((f) => this.sanitizeIdentifier(f));
    const cols = sanitizedColumns.join(", ");
    const valuePlaceholders = editableFields.map((_, idx) => `$${idx + 1}`).join(", ");
    const params: unknown[] = [...editableValues];

    switch (action) {
      case "create":
        return {
          sql: `INSERT INTO ${sanitizedTable} (${cols}) VALUES (${valuePlaceholders}) RETURNING *`,
          params,
        };

      case "update":
        return this.buildUpdateSql(sanitizedTable, sanitizedColumns, editableFields, businessKeys, params, businessKeyValues);

      case "upsert":
        return this.buildUpsertSql(sanitizedTable, sanitizedColumns, cols, valuePlaceholders, businessKeys, params);
    }
  }

  private buildUpdateSql(
    sanitizedTable: string,
    sanitizedColumns: string[],
    editableFields: string[],
    businessKeys: string[],
    params: unknown[],
    businessKeyValues: Record<string, unknown>,
  ): { sql: string; params: unknown[] } {
    // Exclui as business keys do SET — elas pertencem apenas ao WHERE
    const updateFields = editableFields
      .map((field, idx) => ({ field, col: sanitizedColumns[idx], value: params[idx] }))
      .filter(({ field }) => !businessKeys.includes(field));

    if (updateFields.length === 0) {
      // Nenhum campo a atualizar além das business keys
      return { sql: "", params: [] };
    }

    const setClause = updateFields
      .map(({ col }, idx) => `${col} = $${idx + 1}`)
      .join(", ");

    const updateParams = updateFields.map(({ value }) => value);

    const whereClause = businessKeys
      .map((pk, idx) => `${this.sanitizeIdentifier(pk)} = $${updateFields.length + idx + 1}`)
      .join(" AND ");

    businessKeys.forEach((pk) => updateParams.push(businessKeyValues[pk]));

    return {
      sql: `UPDATE ${sanitizedTable} SET ${setClause} WHERE ${whereClause} RETURNING *`,
      params: updateParams,
    };
  }

  private buildUpsertSql(
    sanitizedTable: string,
    sanitizedColumns: string[],
    cols: string,
    valuePlaceholders: string,
    businessKeys: string[],
    params: unknown[],
  ): { sql: string; params: unknown[] } {
    const sanitizedBusinessKeys = businessKeys.map((k) => this.sanitizeIdentifier(k)).join(", ");
    const updateSet = sanitizedColumns
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(", ");

    return {
      sql: `INSERT INTO ${sanitizedTable} (${cols}) VALUES (${valuePlaceholders}) ON CONFLICT (${sanitizedBusinessKeys}) DO UPDATE SET ${updateSet} RETURNING *`,
      params,
    };
  }

  // ──────────────────────────────────────────────
  // Infraestrutura
  // ──────────────────────────────────────────────

  private sanitizeIdentifier(identifier: string): string {
    if (!EntityDynamicRepository.IDENTIFIER_REGEX.test(identifier)) {
      throw new Error(`Identificador SQL inválido: ${identifier}`);
    }
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private async executeInTransaction<T extends { success: boolean; error?: string, stack?: string }>(
    operation: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.mdmDs.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await operation(queryRunner);

      if (result.success) {
        await queryRunner.commitTransaction();
      } else {
        await queryRunner.rollbackTransaction();
      }

      return result;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message } as T;
    } finally {
      await queryRunner.release();
    }
  }
}
