import { reactive } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const items = reactive<ToastItem[]>([]);
let sequence = 0;

function remove(id: number): void {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) items.splice(index, 1);
}

function push(type: ToastType, message: string): void {
  sequence += 1;
  const id = sequence;
  items.push({ id, type, message });
  window.setTimeout(() => remove(id), type === 'error' ? 6500 : 3500);
}

export function useToast() {
  return {
    items,
    push,
    remove,
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
  };
}
