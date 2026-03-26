import { Heart } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { BrowserOpenURL } from '@/wailsjs/runtime/runtime'

const SPONSOR_URL = 'https://github.com/sponsors/leonardaustin'

export function SponsorButton({ compact }: { compact?: boolean }) {
  const handleClick = () => {
    BrowserOpenURL(SPONSOR_URL)
  }

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full font-medium text-white/90 transition-all',
        'hover:text-white hover:shadow-md',
        compact
          ? 'px-2 py-1 text-[10px]'
          : 'px-3 py-1.5 text-xs',
      )}
      style={{
        background: 'linear-gradient(135deg, #e05688 0%, #ea7b4b 100%)',
      }}
      title="Sponsor this project"
    >
      <Heart
        className={cn(
          'shrink-0 fill-current',
          compact ? 'w-3 h-3' : 'w-3.5 h-3.5',
          'group-hover:animate-pulse',
        )}
      />
      {!compact && <span>Sponsor</span>}
    </motion.button>
  )
}
