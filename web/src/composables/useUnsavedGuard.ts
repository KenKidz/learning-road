import { onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { translate } from '../i18n';
import { confirmAction } from './useConfirm';

export function useUnsavedGuard(
  isDirty: Ref<boolean> | ComputedRef<boolean>,
  options: { title?: () => string; message?: () => string } = {},
): void {
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
  });

  onBeforeRouteLeave(async () => {
    if (!isDirty.value) return true;
    return confirmAction({
      title: options.title ? options.title() : translate('common.unsavedLeaveTitle'),
      message: options.message ? options.message() : translate('common.unsavedLeaveText'),
      confirmLabel: translate('common.discardAndLeave'),
      danger: true,
    });
  });
}
