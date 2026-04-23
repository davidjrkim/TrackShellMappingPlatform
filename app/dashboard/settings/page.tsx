import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') redirect('/dashboard/courses')

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
        <p className="text-gray-400 text-sm">User management — Week 4</p>
      </div>
    </div>
  )
}
