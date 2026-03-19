import type { ReactNode } from "react"

interface DetailTabsProps {
  tabs: string[]
  activeTab: string
  onTabChange: (tab: string) => void
  actions?: ReactNode
}

export function DetailTabs({ tabs, activeTab, onTabChange, actions }: DetailTabsProps) {
  return (
    <div className="detail-tabs">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`detail-tab${tab === activeTab ? ' active' : ''}`}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
      {actions && (
        <>
          <div style={{ flex: 1 }} />
          {actions}
        </>
      )}
    </div>
  )
}
