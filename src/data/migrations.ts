/** Export/backup schema version. The Dexie version is separate: v2 added the device-local `kv` table, which exports never contain. Bump when the stored shape changes, and add a Dexie version plus a step in `migrateExport`. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Upgrade an exported backup from an older schema to the current one.
 * v1 is the first schema, so there is nothing to upgrade yet; newer-than-current is refused by the importer.
 */
export function migrateExport<T extends { schemaVersion: number }>(data: T): T {
  return { ...data, schemaVersion: CURRENT_SCHEMA_VERSION };
}
