<script setup lang="ts">
import { computed } from 'vue';
import { clampPercent } from '../lib/format';

const props = withDefaults(
  defineProps<{
    value: number;
    tone?: 'accent' | 'success';
    size?: 'md' | 'lg';
  }>(),
  { tone: 'accent', size: 'md' },
);

const percent = computed(() => clampPercent(props.value));
</script>

<template>
  <div
    class="progress"
    :class="{ 'progress-lg': size === 'lg' }"
    role="progressbar"
    :aria-valuenow="percent"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="progress-bar" :class="{ success: tone === 'success' }" :style="{ width: `${percent}%` }" />
  </div>
</template>
