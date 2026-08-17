/**
 * Backend layer barrel. Node-only (node:http + node:sqlite); never imported by
 * the client bundle or by `domain/` / `shared/`.
 */
export {
  BackendConfigError,
  DEFAULT_BACKEND_DB_PATH,
  DEFAULT_BACKEND_HOST,
  DEFAULT_BACKEND_PORT,
  DEFAULT_SNAPSHOT_REFRESH_SECONDS,
  resolveBackendConfig,
  type BackendConfig,
} from './config.ts'
export { BACKEND_SCHEMA_USER_VERSION, migrate } from './schema.ts'
export {
  isUniqueConstraintError,
  openBackendStore,
  type BackendStore,
  type CaseRow,
  type CommunityIdentityRow,
  type IncenseRow,
  type SnapshotRow,
  type StatsRow,
  type VoteRow,
} from './store.ts'
export { LiangxiangBackendService, toV1Snapshot, type BackendServiceDeps } from './service.ts'
export { createBackendHttpApi, type BackendHttpApi, type BackendHttpOptions } from './http.ts'
export { startBackend } from './main.ts'
