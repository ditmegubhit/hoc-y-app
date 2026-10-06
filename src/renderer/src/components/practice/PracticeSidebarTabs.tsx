import { BookOpen, Scan } from 'lucide-react'

export type SidebarTab = 'lessons' | 'practice'

interface PracticeSidebarTabsProps {
  value: SidebarTab
  onChange: (tab: SidebarTab) => void
}

const TABS: { id: SidebarTab; label: string; icon: React.JSX.Element }[] = [
  { id: 'lessons', label: 'Chủ đề & Bài học', icon: <BookOpen size={14} /> },
  { id: 'practice', label: 'Thực hành GP', icon: <Scan size={14} /> }
]

// Hai tab o dau sidebar: doi giua cay Chu de & Bai hoc va cay Thuc hanh GP.
function PracticeSidebarTabs({ value, onChange }: PracticeSidebarTabsProps): React.JSX.Element {
  return (
    <div className="sidebar-tabs" role="tablist" aria-label="Khu làm việc">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={`sidebar-tab${value === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          title={tab.label}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

export default PracticeSidebarTabs
