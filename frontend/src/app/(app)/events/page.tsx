'use client'

import EventLog from '@/components/events/EventLog'

export default function EventsPage () {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Event Log</h1>
      <EventLog showFilters />
    </div>
  )
}
