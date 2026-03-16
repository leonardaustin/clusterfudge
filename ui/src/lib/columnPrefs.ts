import type { ColumnConfig } from '@/components/table/ColumnCustomizer'

const STORAGE_KEY_PREFIX = 'kubeviewer:columns:'

/**
 * Save column preferences (order + visibility) to localStorage.
 */
export function saveColumnPrefs(
  resourceType: string,
  columns: ColumnConfig[]
): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${resourceType}`
    localStorage.setItem(key, JSON.stringify(columns))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load saved column preferences. Returns null if none saved.
 */
export function loadColumnPrefs(
  resourceType: string
): ColumnConfig[] | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${resourceType}`
    const stored = localStorage.getItem(key)
    if (!stored) return null
    return JSON.parse(stored) as ColumnConfig[]
  } catch {
    return null
  }
}

/**
 * Clear saved column preferences for a resource type.
 */
export function clearColumnPrefs(resourceType: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${resourceType}`
    localStorage.removeItem(key)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Merge saved preferences with the default column config.
 * Handles cases where columns were added/removed since preferences were saved.
 */
export function mergeColumnPrefs(
  defaults: ColumnConfig[],
  saved: ColumnConfig[] | null
): ColumnConfig[] {
  if (!saved) return defaults

  const defaultMap = new Map(defaults.map((c) => [c.id, c]))
  const result: ColumnConfig[] = []

  // Add saved columns that still exist in defaults
  for (const col of saved) {
    const defaultCol = defaultMap.get(col.id)
    if (defaultCol) {
      result.push({ ...defaultCol, visible: col.visible })
      defaultMap.delete(col.id)
    }
  }

  // Add new columns that weren't in saved prefs
  for (const col of defaultMap.values()) {
    result.push(col)
  }

  return result
}
