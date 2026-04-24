import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail, setCourseStatus } from '@/lib/spatial'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (course.status !== 'reviewed') {
    return NextResponse.json(
      { error: `Cannot publish course in status "${course.status}" — must be reviewed` },
      { status: 409 },
    )
  }

  const affected = await setCourseStatus(params.id, session.user.orgId, ['reviewed'], 'published')
  if (affected === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, status: 'published' })
}
