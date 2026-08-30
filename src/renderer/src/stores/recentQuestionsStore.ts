import { create } from 'zustand'

// Danh dau cac cau hoi VUA duoc soan bang AI (to nen xanh trong Ngan hang cau
// hoi). Danh dau giu nguyen cho toi khi bat dau soan dot moi thi xoa.
interface RecentQuestionsState {
  ids: Set<string>
  // Bat dau soan dot moi -> xoa danh dau cu
  startGenerating: () => void
  // Soan xong + luu -> danh dau tap cau moi (thay the tap cu)
  markGenerated: (ids: string[]) => void
}

export const useRecentQuestionsStore = create<RecentQuestionsState>((set) => ({
  ids: new Set(),
  startGenerating: () => set({ ids: new Set() }),
  markGenerated: (ids) => set({ ids: new Set(ids) })
}))
