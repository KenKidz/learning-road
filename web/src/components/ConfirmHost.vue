<script setup lang="ts">
import BaseModal from './BaseModal.vue';
import { confirmState, resolveConfirm } from '../composables/useConfirm';
</script>

<template>
  <BaseModal
    v-if="confirmState.open"
    :title="confirmState.title"
    @close="resolveConfirm(false)"
  >
    <p class="text-soft">{{ confirmState.message }}</p>
    <template #footer>
      <button type="button" class="btn" @click="resolveConfirm(false)">
        {{ confirmState.cancelLabel }}
      </button>
      <button
        type="button"
        class="btn"
        :class="confirmState.danger ? 'btn-danger' : 'btn-primary'"
        @click="resolveConfirm(true)"
      >
        {{ confirmState.confirmLabel }}
      </button>
    </template>
  </BaseModal>
</template>
