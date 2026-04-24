const COLORS: Record<string, string> = {
  queued:    'bg-gray-100 text-gray-700 border-gray-200',
  running:   'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed:    'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export default function JobStatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status}
    </span>
  )
}
