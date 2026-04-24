import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createCourse, listCourses, type BoundingBox } from '@/lib/spatial'

const COUNTRY_RE = /^[A-Z]{2}$/
const VALID_HOLE_COUNTS = new Set([9, 18, 27])

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20))
  const search   = searchParams.get('search') ?? undefined
  const countries = searchParams.getAll('country').filter(Boolean)
  const statuses  = searchParams.getAll('status').filter(Boolean)

  const { rows, total } = await listCourses({
    orgId: session.user.orgId,
    search,
    countries: countries.length ? countries : undefined,
    statuses: statuses.length ? statuses : undefined,
    page,
    pageSize,
  })

  return NextResponse.json({
    courses: rows,
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const {
    name,
    nameLocal,
    country,
    region,
    city,
    holeCount,
    bbox,
  } = body as Record<string, unknown>

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof country !== 'string' || !COUNTRY_RE.test(country)) {
    return NextResponse.json({ error: 'country must be ISO 3166-1 alpha-2 (uppercase)' }, { status: 400 })
  }
  if (typeof holeCount !== 'number' || !VALID_HOLE_COUNTS.has(holeCount)) {
    return NextResponse.json({ error: 'holeCount must be 9, 18, or 27' }, { status: 400 })
  }
  if (!isBoundingBox(bbox)) {
    return NextResponse.json({ error: 'bbox must be { west, south, east, north } with west<east and south<north' }, { status: 400 })
  }

  const { id } = await createCourse({
    orgId: session.user.orgId,
    name: name.trim(),
    nameLocal: typeof nameLocal === 'string' && nameLocal.trim().length > 0 ? nameLocal.trim() : null,
    country,
    region: typeof region === 'string' && region.trim().length > 0 ? region.trim() : null,
    city: typeof city === 'string' && city.trim().length > 0 ? city.trim() : null,
    holeCount,
    bbox,
    dataSource: 'manual',
  })

  return NextResponse.json({ id }, { status: 201 })
}

function isBoundingBox(v: unknown): v is BoundingBox {
  if (typeof v !== 'object' || v === null) return false
  const { west, south, east, north } = v as Record<string, unknown>
  return (
    typeof west === 'number' && typeof south === 'number' &&
    typeof east === 'number' && typeof north === 'number' &&
    Number.isFinite(west) && Number.isFinite(south) &&
    Number.isFinite(east) && Number.isFinite(north) &&
    west < east && south < north &&
    west >= -180 && east <= 180 &&
    south >= -90 && north <= 90
  )
}
