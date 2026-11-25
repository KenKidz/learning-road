<script setup lang="ts">
import Icon from './Icon.vue';
import { useToast, type ToastType } from '../composables/useToast';

const { items, remove } = useToast();

function iconFor(type: ToastType): string {
  if (type === 'success') return 'check-circle';
  if (type === 'error') return 'alert';
  return 'info';
}
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div v-for="toast in items" :key="toast.id" class="toast" :class="toast.type">
        <Icon :name="iconFor(toast.type)" :size="16" class="toast-icon" />
        <span class="grow">{{ toast.message }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-icon btn-xs"
          :aria-label="$t('common.close')"
          @click="remove(toast.id)"
        >
          <Icon name="close" :size="13" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
