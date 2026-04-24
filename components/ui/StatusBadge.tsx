import type { CourseStatus } from '@prisma/client'

type Status = CourseStatus | string

// PRD 2a §4.3 status colours
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  unmapped:   { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400',   label: 'Unmapped' },
  processing: { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500',   label: 'Processing' },
  segmented:  { bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500', label: 'Segmented' },
  assigned:   { bg: 'bg-amber-50',    text: 'text-amber-800',   dot: 'bg-amber-500',  label: 'Assigned' },
  reviewed:   { bg: 'bg-teal-50',     text: 'text-teal-800',    dot: 'bg-teal-500',   label: 'Reviewed' },
  published:  { bg: 'bg-green-50',    text: 'text-green-800',   dot: 'bg-green-500',  label: 'Published' },
  failed:     { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',    label: 'Failed' },
}

export default function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLES[status] ?? {
    bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', label: String(status),
  }
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}
