export const TASK_COLUMNS = [
  { key: 'pending', label: 'EN COLA', color: 'border-gray-600', states: ['ASSIGNED', 'ACCEPTED', 'QUEUED', 'CREATED'] },
  { key: 'running', label: 'EJECUTANDO', color: 'border-electric/50', states: ['IN_PROGRESS', 'RUNNING'] },
  { key: 'review', label: 'ESPERANDO APROBACIÓN', color: 'border-escalate/50', states: ['CERBERUS_REVIEW', 'WAITING_APPROVAL'] },
  { key: 'done', label: 'COMPLETADO', color: 'border-permit/50', states: ['EXECUTED', 'COMPLETED'] },
  { key: 'stopped', label: 'DETENIDO', color: 'border-deny/50', states: ['FAILED', 'CANCELLED', 'SUSPENDED'] },
  { key: 'unknown', label: 'OTRO ESTADO', color: 'border-gray-700', states: [] as string[] },
] as const
export function taskColumn(status: string): string {
  return TASK_COLUMNS.find(column => (column.states as readonly string[]).includes(status))?.key ?? 'unknown'
}
export function isPendingReview(status: string, taskStatuses: string[]): boolean {
  return status === 'WAITING_APPROVAL' || taskStatuses.includes('CERBERUS_REVIEW')
}
export function taskDescription(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'title' in value && typeof value.title === 'string') return value.title
  return null
}
