<script setup lang="ts">
import Icon from './Icon.vue';

withDefaults(
  defineProps<{
    title: string;
    text?: string;
    icon?: string;
  }>(),
  { text: '', icon: 'book' },
);
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <Icon :name="icon" :size="20" />
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="text" class="empty-text">{{ text }}</p>
    <div v-if="$slots.default" class="mt-8">
      <slot />
    </div>
  </div>
</template>
