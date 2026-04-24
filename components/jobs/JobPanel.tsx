'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import JobConfigModal from './JobConfigModal'
import LiveJobProgress from './LiveJobProgress'

type Props = {
  courseId: string
  courseStatus: string
  role: 'admin' | 'reviewer' | string
  /** Currently-active jobId fetched server-side, or null. */
  activeJobId?: string | null
}

export default function JobPanel({ courseId, courseStatus, role, activeJobId }: Props) {
  const router = useRouter()
  const [jobId, setJobId] = useState<string | null>(activeJobId ?? null)
  const [modalOpen, setModalOpen] = useState(false)
  const [watchingTerminal, setWatchingTerminal] = useState<'completed' | 'failed' | 'cancelled' | null>(null)

  const canStart = courseStatus !== 'processing' && !jobId

  // After a terminal state, refresh the server-rendered stats.
  useEffect(() => {
    if (watchingTerminal === 'completed' || watchingTerminal === 'failed' || watchingTerminal === 'cancelled') {
      router.refresh()
    }
  }, [watchingTerminal, router])

  return (
    <div className="space-y-3">
      {canStart && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800"
          data-testid="job-run-open"
        >
          {courseStatus === 'unmapped' ? 'Run Pipeline' :
           courseStatus === 'failed' ? 'Retry Pipeline' :
           'Re-run Pipeline'}
        </button>
      )}

      {jobId && (
        <LiveJobProgress
          jobId={jobId}
          courseId={courseId}
          onDismiss={() => {
            setJobId(null)
            setWatchingTerminal(null)
            router.refresh()
          }}
        />
      )}

      <JobConfigModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onStart={(id) => {
          setJobId(id)
          setModalOpen(false)
          router.refresh()
        }}
        courseId={courseId}
        courseStatus={courseStatus}
        role={role}
      />
    </div>
  )
}
