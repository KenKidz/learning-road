<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { items, remove } = useToast();
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <div v-for="toast in items" :key="toast.id" class="toast" :class="toast.type">
      <span class="grow">{{ toast.message }}</span>
      <button type="button" class="btn btn-ghost btn-sm" :aria-label="$t('common.close')" @click="remove(toast.id)">
        ×
      </button>
    </div>
  </div>
</template>
