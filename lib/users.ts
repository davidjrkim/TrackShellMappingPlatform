import bcrypt from 'bcryptjs'
import { db } from './db'

export type UserListRow = {
  id: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
  created_at: Date
  last_login_at: Date | null
  deactivated: boolean
}

export async function listUsers(orgId: string): Promise<UserListRow[]> {
  return db.$queryRaw<UserListRow[]>`
    SELECT id, email, name, role::text AS role,
           created_at, last_login_at,
           (password_hash = '!') AS deactivated
    FROM users
    WHERE org_id = ${orgId}::uuid
    ORDER BY created_at ASC
  `
}

export async function createUser(input: {
  orgId: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
  password: string
}): Promise<{ id: string } | { error: 'duplicate' }> {
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } })
  if (existing) return { error: 'duplicate' }
  const passwordHash = await bcrypt.hash(input.password, 10)
  const user = await db.user.create({
    data: {
      orgId: input.orgId,
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
    },
    select: { id: true },
  })
  return { id: user.id }
}

export async function updateUser(
  userId: string,
  orgId: string,
  patch: { role?: 'admin' | 'reviewer'; deactivated?: boolean; name?: string },
): Promise<number> {
  const setRole = patch.role !== undefined
  const setDeactivated = patch.deactivated !== undefined
  const setName = patch.name !== undefined
  if (!setRole && !setDeactivated && !setName) return 0

  return db.$executeRaw`
    UPDATE users
    SET
      role = CASE WHEN ${setRole}::boolean THEN ${patch.role ?? 'reviewer'}::"user_role_enum" ELSE role END,
      name = CASE WHEN ${setName}::boolean THEN ${patch.name ?? ''}::varchar ELSE name END,
      password_hash = CASE
        WHEN ${setDeactivated}::boolean AND ${patch.deactivated ?? false}::boolean THEN '!'
        ELSE password_hash
      END
    WHERE id = ${userId}::uuid
      AND org_id = ${orgId}::uuid
  `
}

export async function countAdmins(orgId: string): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM users
    WHERE org_id = ${orgId}::uuid
      AND role = 'admin'::"user_role_enum"
      AND password_hash <> '!'
  `
  return Number(rows[0]?.n ?? 0)
}
