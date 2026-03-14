'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'

const NAV = [
  { href: '/dashboard', label: 'Dashboard',  icon: '▣' },
  { href: '/devices',   label: 'Devices',    icon: '⊞' },
  { href: '/trends',    label: 'Trends',     icon: '∿' },
  { href: '/events',    label: 'Event Log',  icon: '≡' },
  { href: '/admin',     label: 'Admin',      icon: '⚙' },
]

export default function Sidebar () {
  const pathname = usePathname()
  const router   = useRouter()

  function logout () {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    router.push('/login')
  }

  return (
    <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-800">
        <p className="font-bold text-white">Irrigation</p>
        <p className="text-gray-400 text-xs">Monitor Platform</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <span className="text-lg">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-gray-800">
        <button
          onClick={logout}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
