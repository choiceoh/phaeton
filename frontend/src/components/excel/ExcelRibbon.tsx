import { useState } from 'react'
import { useExcelToolbar } from '@/contexts/ExcelToolbarContext'

type RibbonTab = '홈' | '보기'

export default function ExcelRibbon() {
  const [activeTab, setActiveTab] = useState<RibbonTab>('홈')
  const { toolbarContent, pageActions, sheetTabs } = useExcelToolbar()

  const tabs: RibbonTab[] = ['홈', '보기']

  return (
    <div className="border-b border-[#d4d4d4] bg-[#f3f3f3]">
      {/* Tab headers */}
      <div className="flex items-center h-[24px] px-1 gap-0 border-b border-[#d4d4d4]">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-3 py-0.5 text-[11px] font-medium border-x border-t transition-colors ${
              activeTab === tab
                ? 'bg-white text-[#333] border-[#d4d4d4] -mb-px relative z-10'
                : 'bg-transparent text-[#666] border-transparent hover:bg-[#e8e8e8]'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex items-center gap-1 px-2 py-1 min-h-[32px]">
        {activeTab === '홈' && (
          <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
            {toolbarContent}
          </div>
        )}
        {activeTab === '보기' && (
          <div className="flex items-center gap-2 flex-1">
            {pageActions}
            {sheetTabs && (
              <div className="flex items-center gap-1 border-l border-[#d4d4d4] pl-2 ml-1">
                <span className="text-[11px] text-[#666] mr-1">저장된 보기:</span>
                {sheetTabs}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
