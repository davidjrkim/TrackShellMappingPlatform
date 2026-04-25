import { PrismaClient, CourseStatus, DataSourceType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// Seed courses via raw SQL because bounding_box is a PostGIS geometry column
// that Prisma cannot write to through the generated client.
async function insertCourse(params: {
  orgId: string
  name: string
  nameLocal?: string
  country: string
  region?: string
  city?: string
  lat: number
  lng: number
  // SW and NE corners of the bounding box
  bbox: [west: number, south: number, east: number, north: number]
  holeCount?: number
  status: CourseStatus
  dataSource: DataSourceType
}) {
  const [west, south, east, north] = params.bbox
  await db.$executeRaw`
    INSERT INTO courses (
      id, org_id, name, name_local, country, region, city,
      latitude, longitude, bounding_box,
      hole_count, status, data_source
    ) VALUES (
      gen_random_uuid(),
      ${params.orgId}::uuid,
      ${params.name},
      ${params.nameLocal ?? null},
      ${params.country},
      ${params.region ?? null},
      ${params.city ?? null},
      ${params.lat},
      ${params.lng},
      ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326),
      ${params.holeCount ?? 18},
      ${params.status}::"course_status",
      ${params.dataSource}::"data_source_type"
    )
  `
}

async function main() {
  console.log('Seeding database…')

  // Organization
  const org = await db.organization.upsert({
    where: { name: 'TrackShell Internal' },
    update: {},
    create: { name: 'TrackShell Internal' },
  })
  console.log(`  Org: ${org.name} (${org.id})`)

  // Admin user
  const adminHash = await bcrypt.hash('admin123', 12)
  const admin = await db.user.upsert({
    where: { email: 'admin@trackshell.io' },
    update: {},
    create: {
      orgId: org.id,
      email: 'admin@trackshell.io',
      passwordHash: adminHash,
      name: 'David Kim',
      role: 'admin',
    },
  })
  console.log(`  Admin: ${admin.email}`)

  // Reviewer user
  const reviewerHash = await bcrypt.hash('reviewer123', 12)
  const reviewer = await db.user.upsert({
    where: { email: 'reviewer@trackshell.io' },
    update: {},
    create: {
      orgId: org.id,
      email: 'reviewer@trackshell.io',
      passwordHash: reviewerHash,
      name: 'Jane Reviewer',
      role: 'reviewer',
    },
  })
  console.log(`  Reviewer: ${reviewer.email}`)

  // Courses — one per status for easy dev/test coverage
  const courses: Parameters<typeof insertCourse>[0][] = [
    {
      orgId: org.id,
      name: 'Woo Jeong Hills Country Club',
      nameLocal: '우정힐스 CC',
      country: 'KR',
      region: 'Gyeonggi',
      city: 'Hwaseong',
      lat: 37.1954,
      lng: 126.8712,
      bbox: [126.855, 37.182, 126.892, 37.210],
      status: 'published',
      dataSource: 'ml_pipeline',
    },
    {
      orgId: org.id,
      name: 'Seoul Country Club',
      nameLocal: '서울 CC',
      country: 'KR',
      region: 'Gyeonggi',
      city: 'Seongnam',
      lat: 37.4012,
      lng: 127.1145,
      bbox: [127.095, 37.385, 127.135, 37.418],
      status: 'assigned',
      dataSource: 'ml_pipeline',
    },
    {
      orgId: org.id,
      name: 'Jeju Lakeside Golf Club',
      nameLocal: '제주 레이크사이드',
      country: 'KR',
      region: 'Jeju',
      city: 'Seogwipo',
      lat: 33.2841,
      lng: 126.5098,
      bbox: [126.494, 33.270, 126.526, 33.298],
      status: 'processing',
      dataSource: 'ml_pipeline',
    },
    {
      orgId: org.id,
      name: 'Royal Copenhagen Golf Club',
      country: 'DK',
      region: 'Capital Region',
      city: 'Copenhagen',
      lat: 55.7073,
      lng: 12.5585,
      bbox: [12.540, 55.695, 12.578, 55.720],
      status: 'unmapped',
      dataSource: 'manual',
    },
    {
      orgId: org.id,
      name: 'Bella Center Golf Course',
      country: 'DK',
      region: 'Capital Region',
      city: 'Copenhagen',
      lat: 55.6492,
      lng: 12.5785,
      bbox: [12.560, 55.638, 12.598, 55.661],
      status: 'failed',
      dataSource: 'ml_pipeline',
    },
  ]

  for (const course of courses) {
    await insertCourse(course)
    console.log(`  Course: ${course.name} (${course.status})`)
  }

  // Seed holes for the 'assigned' course (Seoul CC) so the review UI
  // has data to work with right away.
  const seoulCC = await db.course.findFirst({ where: { name: 'Seoul Country Club' } })
  if (seoulCC) {
    // 3 flagged holes, rest clean
    const flaggedHoles = new Set([3, 7, 12])
    for (let n = 1; n <= 18; n++) {
      const flagged = flaggedHoles.has(n)
      await db.hole.upsert({
        where: { uq_course_hole: { courseId: seoulCC.id, holeNumber: n } },
        update: {},
        create: {
          courseId: seoulCC.id,
          holeNumber: n,
          par: n % 3 === 0 ? 3 : n % 5 === 0 ? 5 : 4,
          confidence: flagged ? parseFloat((0.45 + Math.random() * 0.2).toFixed(3)) : parseFloat((0.82 + Math.random() * 0.12).toFixed(3)),
          needsReview: flagged,
        },
      })
    }
    console.log(`  Holes: 18 holes seeded for Seoul Country Club (3 flagged)`)
  }

  console.log('\nSeed complete.')
  console.log('  admin@trackshell.io   / admin123')
  console.log('  reviewer@trackshell.io / reviewer123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
