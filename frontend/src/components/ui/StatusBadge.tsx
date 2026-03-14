interface Props {
  online: boolean
}

export default function StatusBadge ({ online }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
      ${online
        ? 'bg-green-900/40 text-green-400 border border-green-800'
        : 'bg-gray-800    text-gray-400  border border-gray-700'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}
