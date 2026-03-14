'use client'

import React, { createContext, useContext, useEffect, useRef } from 'react'
import type { WsMessage } from '@/types'
import { useDeviceStore } from '@/store/deviceStore'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://192.168.2.10:3001'

const WebSocketContext = createContext<null>(null)

export function WebSocketProvider ({ children }: { children: React.ReactNode }) {
  const wsRef       = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { updateBatch, addEvent } = useDeviceStore()

  useEffect(() => {
    function connect () {
      const token = localStorage.getItem('auth_token')
      if (!token) return   // not logged in yet

      const ws = new WebSocket(`${WS_URL}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }))
      }

      ws.onmessage = (e) => {
        try {
          const msg: WsMessage = JSON.parse(e.data)
          if (msg.type === 'devices_batch') {
            updateBatch((msg as { type: string; devices: import('@/types').LiveDeviceData[] }).devices)
          } else if (msg.type === 'event') {
            addEvent((msg as { type: string; data: import('@/types').DeviceEvent }).data)
          }
        } catch { /* ignore malformed */ }
      }

      ws.onclose = () => {
        reconnectRef.current = setTimeout(connect, 5_000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [updateBatch, addEvent])

  return (
    <WebSocketContext.Provider value={null}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket () {
  return useContext(WebSocketContext)
}
