'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const navItems = [
  { label: 'Courses', href: '/dashboard/courses', adminOnly: false },
  { label: 'Jobs', href: '/dashboard/jobs', adminOnly: false },
  { label: 'Settings', href: '/dashboard/settings', adminOnly: true },
]

export default function Sidebar({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname()

  return (
    <aside className="w-60 shrink-0 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">TrackShell</p>
        <p className="text-sm font-medium text-white mt-0.5">Mapping Platform</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((item) => !item.adminOnly || role === 'admin')
          .map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 truncate mb-2">{userName}</p>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left text-xs text-gray-400 hover:text-white transition-colors py-1"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
