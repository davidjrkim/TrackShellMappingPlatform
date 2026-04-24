import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getCourseDetail,
  getCourseStats,
  softDeleteCourse,
  updateCourseMetadata,
} from '@/lib/spatial'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stats = await getCourseStats(params.id)

  return NextResponse.json({ course, stats })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { name, nameLocal, region, city } = body as Record<string, unknown>

  const patch: {
    name?: string
    nameLocal?: string | null
    region?: string | null
    city?: string | null
  } = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    patch.name = name.trim()
  }
  if (nameLocal !== undefined) {
    patch.nameLocal = nameLocal === null || nameLocal === ''
      ? null
      : typeof nameLocal === 'string' ? nameLocal.trim() : null
  }
  if (region !== undefined) {
    patch.region = region === null || region === ''
      ? null
      : typeof region === 'string' ? region.trim() : null
  }
  if (city !== undefined) {
    patch.city = city === null || city === ''
      ? null
      : typeof city === 'string' ? city.trim() : null
  }

  const affected = await updateCourseMetadata(params.id, session.user.orgId, patch)
  if (affected === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const course = await getCourseDetail(params.id, session.user.orgId)
  return NextResponse.json({ course })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const affected = await softDeleteCourse(params.id, session.user.orgId)
  if (affected === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
