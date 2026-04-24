import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { listUsers } from '@/lib/users'
import UserAdminTable from '@/components/settings/UserAdminTable'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard/courses')

  const users = await listUsers(session.user.orgId)

  const serializable = users.map((u) => ({
    ...u,
    created_at: u.created_at.toISOString(),
    last_login_at: u.last_login_at ? u.last_login_at.toISOString() : null,
  }))

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
      <UserAdminTable users={serializable} currentUserId={session.user.id} />
    </div>
  )
}
