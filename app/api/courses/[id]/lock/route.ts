import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail } from '@/lib/spatial'
import { acquireLock, releaseLock } from '@/lib/review'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await acquireLock(params.id, session.user.orgId, session.user.id)
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'Course is locked by another reviewer',
        lockedBy: result.lockedBy,
      },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true, lockedAt: result.lockedAt })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await releaseLock(params.id, session.user.orgId, session.user.id)
  return NextResponse.json({ ok: true })
}
