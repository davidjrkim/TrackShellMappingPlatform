'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type User = {
  id: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
  created_at: string
  last_login_at: string | null
  deactivated: boolean
}

export default function UserAdminTable({
  users,
  currentUserId,
}: {
  users: User[]
  currentUserId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'reviewer' as 'admin' | 'reviewer', password: '' })

  async function patch(userId: string, body: Record<string, unknown>) {
    setBusy(userId)
    setError(null)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error ?? `Update failed (${res.status})`)
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy('new')
    setError(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error ?? `Create failed (${res.status})`)
        return
      }
      setForm({ email: '', name: '', role: 'reviewer', password: '' })
      setShowNew(false)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Users ({users.length})</h2>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800"
        >
          {showNew ? 'Cancel' : '+ Add user'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {showNew && (
        <form onSubmit={create} className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'reviewer' })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password (≥8 chars)</label>
            <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
          </div>
          <button type="submit" disabled={busy === 'new'} className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md disabled:opacity-50">
            {busy === 'new' ? 'Creating…' : 'Create user'}
          </button>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Name</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Email</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Role</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Last login</th>
              <th className="text-right font-medium text-gray-700 px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className={`border-b last:border-b-0 border-gray-100 ${u.deactivated ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 text-gray-900">{u.name}{isSelf && <span className="text-xs text-gray-400 ml-1">(you)</span>}</td>
                  <td className="px-4 py-2 text-gray-700">{u.email}</td>
                  <td className="px-4 py-2 text-gray-700">
                    {u.deactivated
                      ? <span className="text-xs text-gray-500">deactivated</span>
                      : u.role}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!u.deactivated && (
                      <>
                        <button
                          type="button"
                          disabled={busy === u.id || isSelf}
                          onClick={() => patch(u.id, { role: u.role === 'admin' ? 'reviewer' : 'admin' })}
                          className="text-xs text-gray-700 hover:text-gray-900 underline-offset-2 hover:underline mr-3 disabled:text-gray-300 disabled:no-underline"
                        >
                          {u.role === 'admin' ? 'Demote to reviewer' : 'Promote to admin'}
                        </button>
                        <button
                          type="button"
                          disabled={busy === u.id || isSelf}
                          onClick={() => patch(u.id, { deactivated: true })}
                          className="text-xs text-red-700 hover:text-red-900 underline-offset-2 hover:underline disabled:text-gray-300 disabled:no-underline"
                        >
                          Deactivate
                        </button>
                      </>
                    )}
                    {u.deactivated && (
                      <span className="text-xs text-gray-400">Reactivation requires password reset</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
