import { reactive } from 'vue';
import { translate } from '../i18n';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolver: ((value: boolean) => void) | null;
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: translate('common.confirm'),
  cancelLabel: translate('common.cancel'),
  danger: false,
  resolver: null,
});

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (confirmState.resolver) {
    confirmState.resolver(false);
  }
  confirmState.open = true;
  confirmState.title = options.title;
  confirmState.message = options.message;
  confirmState.confirmLabel = options.confirmLabel ?? translate('common.confirm');
  confirmState.cancelLabel = options.cancelLabel ?? translate('common.cancel');
  confirmState.danger = options.danger ?? false;
  return new Promise<boolean>((resolve) => {
    confirmState.resolver = resolve;
  });
}

export function resolveConfirm(value: boolean): void {
  const resolver = confirmState.resolver;
  confirmState.open = false;
  confirmState.resolver = null;
  resolver?.(value);
}
