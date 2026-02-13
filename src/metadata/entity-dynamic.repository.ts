import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { FieldMetadata, IntegrationEntity } from "@cargolift-cdi/types";
import { IntegrationEntityRepository } from "../middleware/integration/integration-entity-repository.service.js";

export interface EntityDynamicSaveResult {
  success: boolean;
  data?: any;
  error?: string;
}

@Injectable()
export class EntityDynamicRepository {
  constructor(
    @InjectDataSource("mdm") private readonly mdmDs: DataSource,
    private readonly integrationEntityRepository: IntegrationEntityRepository,
  ) {}

  async exists(entity: string, filters: Record<string, any>): Promise<boolean> {
    const result = await this.findOne(entity, filters);
    return !!result;
  }

  async find(entity: string, filters: Record<string, any>) {

    let sql = `SELECT * FROM ${entity} WHERE 1=1`;

    for (const [key, value] of Object.entries(filters)) {
      sql += ` AND ${key} = '${value}'`;
    }

    return this.mdmDs.query(sql);
  }

  async findOne(entity: string, filters: Record<string, any>) {
    const results = await this.find(entity, filters);
    return results[0] ?? null;
  }

  async save(entity: string, data: any, action: "create" | "update" | "upsert", entityData: IntegrationEntity) : Promise<EntityDynamicSaveResult> {
    const entityRecord = entityData ?? await this.integrationEntityRepository.getFirstActive(entity);
    if (!entityRecord) {
      return { success: false, error: `Entidade não encontrada: ${entity}` };
    }

    if (!entityRecord?.metadados?.storage) {
      return { success: false, error: `Tabela de armazenamento não definida para a entidade: ${entity}` };
    }

    if (!entityRecord?.metadados?.fields || entityRecord.metadados.fields.length === 0) {
      return { success: false, error: `Nenhum campo definido para a entidade: ${entity}` };
    }

    const table = entityRecord?.metadados?.storage?.table;
    const businessKeys = entityRecord?.metadados?.storage?.businessKey ?? [];

    if ((action === "update" || action === "upsert") && businessKeys.length === 0) {
      return { success: false, error: "Chave primária não definida para a entidade" };
    }

    const editableFields = entityRecord?.metadados?.fields
      .filter((f: FieldMetadata) => !f.schema?.readonly)
      .map((f: FieldMetadata) => f.field);
    if (!editableFields || editableFields.length === 0) {
      return { success: false, error: `Nenhum campo editável definido para a entidade: ${entity}` };
    }

    const cols = editableFields.join(", ");
    const valuePlaceholders = editableFields.map((_: any, idx: number) => `$${idx + 1}`).join(", ");
    const editableValues = editableFields.map((f: string) => data?.[f] ?? null);

    let sql: string;
    const params: any[] = [...editableValues];

    if (action === "create") {
      sql = `
        INSERT INTO ${table} (${cols})
        VALUES (${valuePlaceholders})
        RETURNING *;
      `;
    } else if (action === "update") {
      const missingPk = businessKeys.filter((pk: string) => data?.[pk] === undefined || data?.[pk] === null);
      if (missingPk.length > 0) {
        return { success: false, error: `Campos de chave primária ausentes: ${missingPk.join(", ")}` };
      }

      const whereClause = businessKeys
        .map((pk: string, idx: number) => `${pk} = $${editableFields.length + idx + 1}`)
        .join(" AND ");
      const setClause = editableFields.map((f: string, idx: number) => `${f} = $${idx + 1}`).join(", ");

      businessKeys.forEach((pk: string) => params.push(data[pk]));

      sql = `
        UPDATE ${table}
        SET ${setClause}
        WHERE ${whereClause}
        RETURNING *;
      `;
    } else {
      const businessKeyList = businessKeys.join(", ");
      const updateSet = editableFields.map((f: string) => `${f} = EXCLUDED.${f}`).join(", ");

      sql = `
        INSERT INTO ${table} (${cols})
        VALUES (${valuePlaceholders})
        ON CONFLICT (${businessKeyList})
        DO UPDATE SET ${updateSet}
        RETURNING *;
      `;
    }

    const result = await this.mdmDs.query(sql, params);

    if (action === "update" && result.length === 0) {
      return { success: false, error: "Nenhum registro encontrado para atualizar" };
    }

    return { success: true, data: result[0] ?? null };
  }
}
