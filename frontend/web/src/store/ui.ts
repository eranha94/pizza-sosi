import { create } from 'zustand';

/** Which menu category is on screen – drives the underline in the header. */
export const useActiveCategory = create<{ active: string | null; set: (id: string | null) => void }>((set) => ({
  active: null,
  set: (active) => set({ active }),
}));
