import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { countAdmins, listUsers, updateUser } from '@/lib/users'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
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
  const { role, deactivated, name } = body as Record<string, unknown>

  const patch: { role?: 'admin' | 'reviewer'; deactivated?: boolean; name?: string } = {}
  if (role !== undefined) {
    if (role !== 'admin' && role !== 'reviewer') {
      return NextResponse.json({ error: 'role must be admin or reviewer' }, { status: 400 })
    }
    patch.role = role
  }
  if (deactivated !== undefined) {
    if (typeof deactivated !== 'boolean') {
      return NextResponse.json({ error: 'deactivated must be boolean' }, { status: 400 })
    }
    patch.deactivated = deactivated
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    patch.name = name.trim()
  }

  const users = await listUsers(session.user.orgId)
  const target = users.find((u) => u.id === params.id)
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Guard: never leave the org with zero active admins.
  const willDemote = patch.role === 'reviewer' && target.role === 'admin' && !target.deactivated
  const willDeactivate = patch.deactivated === true && target.role === 'admin' && !target.deactivated
  if (willDemote || willDeactivate) {
    const activeAdmins = await countAdmins(session.user.orgId)
    if (activeAdmins <= 1) {
      return NextResponse.json(
        { error: 'Cannot demote or deactivate the last active admin' },
        { status: 409 },
      )
    }
  }

  if (params.id === session.user.id && willDemote) {
    return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 409 })
  }
  if (params.id === session.user.id && patch.deactivated === true) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 409 })
  }

  const affected = await updateUser(params.id, session.user.orgId, patch)
  if (affected === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
