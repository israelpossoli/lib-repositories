import { QueryFailedError } from 'typeorm';

export enum DatabaseErrorType {
  TRANSIENT = 'TRANSIENT',
  FATAL = 'FATAL',
}

export interface ClassifiedError {
  type: DatabaseErrorType;
  code?: string;
  message: string;
  original: unknown;
}

/**
 * Classificador de erros de banco de dados PostgreSQL.
 *
 * Analisa erros lançados pelo TypeORM (QueryFailedError) e erros de rede/conexão
 * do Node.js, classificando-os como transitórios (retry) ou fatais (reject).
 *
 * @remarks
 * - Códigos SQLSTATE seguem a documentação oficial do PostgreSQL:
 *   https://www.postgresql.org/docs/current/errcodes-appendix.html
 * - Erros de rede (ECONNREFUSED, ECONNRESET, etc.) são tratados como transitórios
 *   pois indicam indisponibilidade temporária, não falha de dados.
 * - Default conservador: erros não reconhecidos são classificados como FATAL.
 */
export class DataBaseErrorClassifier {
  // ── Códigos SQLSTATE transitórios (PostgreSQL) ─────────────────────
  private static readonly transientCodes = new Set([
    // Classe 08 — Connection Exception
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure

    // Classe 40 — Transaction Rollback
    '40001', // serialization_failure
    '40P01', // deadlock_detected

    // Classe 53 — Insufficient Resources
    '53300', // too_many_connections
    '53400', // configuration_limit_exceeded

    // Classe 55 — Object Not In Prerequisite State
    '55P03', // lock_not_available

    // Classe 57 — Operator Intervention
    '57014', // query_canceled (statement_timeout)
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
  ]);

  // ── Códigos SQLSTATE fatais (PostgreSQL) ─────────────────────────
  private static readonly fatalCodes = new Set([
    // Classe 22 — Data Exception
    '22P02', // invalid_text_representation
    '22003', // numeric_value_out_of_range
    '22007', // invalid_datetime_format
    '22008', // datetime_field_overflow
    '22012', // division_by_zero

    // Classe 23 — Integrity Constraint Violation
    '23502', // not_null_violation
    '23503', // foreign_key_violation
    '23505', // unique_violation
    '23514', // check_violation

    // Classe 42 — Syntax Error or Access Rule Violation
    '42601', // syntax_error
    '42703', // undefined_column
    '42P01', // undefined_table
    '42P07', // duplicate_table
  ]);

  // ── Códigos de erro de rede do Node.js (transitórios) ──────────────
  private static readonly transientNetworkCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ECONNABORTED',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ]);

  /**
   * Classifica um erro como transitório ou fatal.
   *
   * - `QueryFailedError`  → analisa o SQLSTATE code do driver PostgreSQL
   * - Erros de rede/conexão → verifica `err.code` contra códigos de rede conhecidos
   * - Demais erros         → classificados como FATAL (conservador)
   */
  static classify(err: unknown): ClassifiedError {
    // ── Erros de rede / conexão (não são QueryFailedError) ─────────
    if (this.isNetworkError(err)) {
      const code = (err as NodeJS.ErrnoException).code!;
      return {
        type: DatabaseErrorType.TRANSIENT,
        code,
        message: (err as Error).message ?? 'Network error',
        original: err,
      };
    }

    // ── Erros que não são do TypeORM ────────────────────────────
    if (!(err instanceof QueryFailedError)) {
      return {
        type: DatabaseErrorType.FATAL,
        message: (err as Error)?.message ?? 'Unknown error',
        original: err,
      };
    }

    // ── QueryFailedError: analisa SQLSTATE ──────────────────────
    const code: string | undefined = (err as any).driverError?.code;

    if (code && this.transientCodes.has(code)) {
      return {
        type: DatabaseErrorType.TRANSIENT,
        code,
        message: err.message,
        original: err,
      };
    }

    if (code && this.fatalCodes.has(code)) {
      return {
        type: DatabaseErrorType.FATAL,
        code,
        message: err.message,
        original: err,
      };
    }

    // Default: fatal (conservador — melhor rejeitar do que entrar em loop de retry)
    return {
      type: DatabaseErrorType.FATAL,
      code,
      message: err.message,
      original: err,
    };
  }

  /**
   * Verifica se o erro é de rede/conexão do Node.js (não do banco).
   * Esses erros indicam que o banco está inacessível e são transitórios.
   */
  private static isNetworkError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const code = (err as NodeJS.ErrnoException).code;
    return !!code && this.transientNetworkCodes.has(code);
  }
}