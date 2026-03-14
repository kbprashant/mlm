'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WebSocketProvider } from '@/providers/WebSocketProvider'
import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout ({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    if (!localStorage.getItem('auth_token')) {
      router.replace('/login')
    }
  }, [router])

  return (
    <WebSocketProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-950 px-6 py-5">
          {children}
        </main>
      </div>
    </WebSocketProvider>
  )
}
