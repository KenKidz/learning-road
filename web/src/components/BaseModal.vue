<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import Icon from './Icon.vue';

withDefaults(defineProps<{ title: string; wide?: boolean }>(), { wide: false });
const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  const count = Number(document.body.dataset.modalCount ?? '0') + 1;
  document.body.dataset.modalCount = String(count);
  document.body.classList.add('modal-open');
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  const count = Math.max(0, Number(document.body.dataset.modalCount ?? '1') - 1);
  if (count === 0) {
    delete document.body.dataset.modalCount;
    document.body.classList.remove('modal-open');
  } else {
    document.body.dataset.modalCount = String(count);
  }
});
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
        <div class="modal-sheet-handle" aria-hidden="true" />
        <div class="modal-head">
          <h2 class="modal-title">{{ title }}</h2>
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            <Icon name="close" :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
