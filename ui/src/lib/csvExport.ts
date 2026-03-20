/**
 * Export tabular data to CSV and trigger download.
 */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  data: T[],
  columns: { key: keyof T; label: string }[]
): void {
  if (data.length === 0) return

  const header = columns.map((c) => escapeCsvField(String(c.label))).join(',')

  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key]
        return escapeCsvField(val == null ? '' : String(val))
      })
      .join(',')
  )

  const csv = [header, ...rows].join('\n')
  downloadCsv(filename, csv)
}

function escapeCsvField(value: string): string {
  // Prevent CSV injection: prefix formula-triggering characters with a single quote
  if (/^[=+\-@\t\r]/.test(value)) {
    value = "'" + value
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
