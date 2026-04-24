'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Role = 'admin' | 'reviewer' | string
type Status = 'unmapped' | 'processing' | 'segmented' | 'assigned' | 'reviewed' | 'published' | 'failed' | string

type Props = {
  courseId: string
  courseName: string
  status: Status
  role: Role
  size?: 'sm' | 'md'
}

// Role + status gating per PRD 2a §6.3
export default function CourseActionButtons({ courseId, courseName, status, role, size = 'md' }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [publishing, setPublishing] = useState<'publish' | 'unpublish' | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  async function doPublish(kind: 'publish' | 'unpublish') {
    setPublishing(kind)
    setPublishError(null)
    try {
      const res = await fetch(`/api/courses/${courseId}/${kind}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setPublishError(data?.error ?? `${kind} failed (${res.status})`)
        setPublishing(null)
        return
      }
      router.refresh()
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : `${kind} failed`)
    } finally {
      setPublishing(null)
    }
  }

  const isAdmin = role === 'admin'
  const btn = size === 'sm'
    ? 'px-2.5 py-1 text-xs'
    : 'px-3 py-1.5 text-sm'

  async function onDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data?.error ?? `Delete failed (${res.status})`)
        setDeleting(false)
        return
      }
      router.push('/dashboard/courses')
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  // Primary action by status
  const primary = (() => {
    if (status === 'unmapped' || status === 'failed') {
      return { label: status === 'failed' ? 'Retry' : 'Run Pipeline', href: `/dashboard/courses/${courseId}/overview`, disabled: false }
    }
    if (status === 'processing') {
      return { label: 'View Job', href: `/dashboard/courses/${courseId}/overview`, disabled: false }
    }
    if (status === 'assigned') {
      return { label: 'Review Holes', href: `/dashboard/courses/${courseId}/review`, disabled: false }
    }
    if (status === 'reviewed' && isAdmin) {
      return { label: 'Publish', href: `/dashboard/courses/${courseId}/overview`, disabled: false }
    }
    return { label: 'View', href: `/dashboard/courses/${courseId}/overview`, disabled: false }
  })()

  const showPublish = status === 'reviewed' && isAdmin
  const showUnpublish = status === 'published' && isAdmin

  return (
    <div className="flex flex-col items-end gap-1">
    <div className="flex items-center gap-2">
      {showPublish ? (
        <button
          type="button"
          onClick={() => doPublish('publish')}
          disabled={publishing !== null}
          className={`${btn} inline-flex items-center rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors`}
          data-testid="course-publish"
        >
          {publishing === 'publish' ? 'Publishing…' : 'Publish'}
        </button>
      ) : (
        <Link
          href={primary.href}
          className={`${btn} inline-flex items-center rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors`}
          data-testid="course-primary-action"
        >
          {primary.label}
        </Link>
      )}

      {showUnpublish && (
        <button
          type="button"
          onClick={() => doPublish('unpublish')}
          disabled={publishing !== null}
          className={`${btn} inline-flex items-center rounded-md bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50`}
          data-testid="course-unpublish"
        >
          {publishing === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
        </button>
      )}

      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className={`${btn} inline-flex items-center rounded-md bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors`}
            data-testid="course-delete"
          >
            Delete
          </button>
          {confirmOpen && (
            <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
              <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
                <h3 className="text-base font-semibold text-gray-900">Delete course</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This will soft-delete <strong>{courseName}</strong>. Type the course name to confirm.
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={courseName}
                  className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => { setConfirmOpen(false); setConfirmText(''); setDeleteError(null) }}
                    className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={deleting || confirmText !== courseName}
                    className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="course-delete-confirm"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    {publishError && <p className="text-xs text-red-600">{publishError}</p>}
    </div>
  )
}
