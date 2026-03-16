interface DetailTabsProps {
  tabs: string[]
  activeTab: string
  onTabChange: (tab: string) => void
}

export function DetailTabs({ tabs, activeTab, onTabChange }: DetailTabsProps) {
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
    </div>
  )
}
