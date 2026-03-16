import { cn } from '@/lib/utils'

interface ResourceLinkProps {
  name: string
  kind: string
  namespace?: string
  onClick?: () => void
  className?: string
}

export function ResourceLink({
  name,
  kind,
  namespace,
  onClick,
  className,
}: ResourceLinkProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'text-sm text-accent hover:text-accent/80 hover:underline truncate text-left',
        className
      )}
      title={namespace ? `${kind}/${namespace}/${name}` : `${kind}/${name}`}
    >
      {name}
    </button>
  )
}
