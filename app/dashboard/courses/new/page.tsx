'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BoundingBoxPicker from '@/components/map/BoundingBoxPicker'
import type { BoundingBox } from '@/lib/spatial'

// Minimal curated list — expand as needed. ISO 3166-1 alpha-2.
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'KR', name: 'South Korea' },
  { code: 'DK', name: 'Denmark' },
  { code: 'US', name: 'United States' },
  { code: 'JP', name: 'Japan' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DE', name: 'Germany' },
]

export default function NewCoursePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [nameLocal, setNameLocal] = useState('')
  const [country, setCountry] = useState('KR')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [holeCount, setHoleCount] = useState<9 | 18 | 27>(18)
  const [bbox, setBbox] = useState<BoundingBox | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!bbox) {
      setError('Draw a bounding box on the map before submitting.')
      return
    }
    if (!name.trim()) {
      setError('Course name is required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          nameLocal: nameLocal.trim() || undefined,
          country,
          region: region.trim() || undefined,
          city: city.trim() || undefined,
          holeCount,
          bbox,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? `Create failed (${res.status})`)
        setSubmitting(false)
        return
      }
      const { id } = await res.json()
      router.push(`/dashboard/courses/${id}/overview?created=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/courses" className="text-xs text-gray-500 hover:text-gray-700">← Back to courses</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Add a course</h1>
        <p className="text-sm text-gray-500 mt-1">
          Minimum metadata the pipeline needs to fetch satellite tiles.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 bg-white border border-gray-200 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Course name (English) *</label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Seoul Country Club"
              data-testid="course-name"
            />
          </div>
          <div>
            <label htmlFor="name-local" className="block text-sm font-medium text-gray-700 mb-1">Course name (local)</label>
            <input
              id="name-local"
              value={nameLocal}
              onChange={(e) => setNameLocal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="서울 CC"
            />
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              data-testid="course-country"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="holes" className="block text-sm font-medium text-gray-700 mb-1">Number of holes *</label>
            <select
              id="holes"
              value={holeCount}
              onChange={(e) => setHoleCount(Number(e.target.value) as 9 | 18 | 27)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value={9}>9</option>
              <option value={18}>18</option>
              <option value={27}>27</option>
            </select>
          </div>
          <div>
            <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1">Region / Province</label>
            <input
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GPS bounding box *</label>
          <BoundingBoxPicker value={bbox} onChange={setBbox} />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Internal notes for reviewers"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="course-form-error">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link href="/dashboard/courses" className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="course-submit"
          >
            {submitting ? 'Creating…' : 'Create course'}
          </button>
        </div>
      </form>
    </div>
  )
}
