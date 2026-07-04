// FILE: src/store/sidebar.store.ts
// Estado del drawer del sidebar en mobile (< md). En desktop el sidebar
// siempre está visible y este estado no tiene efecto.
import { create } from 'zustand';

interface SidebarStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
