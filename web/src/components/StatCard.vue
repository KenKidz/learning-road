<script setup lang="ts">
import { RouterLink } from 'vue-router';
import Icon from './Icon.vue';
import ProgressBar from './ProgressBar.vue';

withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    note?: string;
    icon?: string;
    tone?: 'default' | 'accent' | 'success' | 'warning' | 'info';
    progress?: number;
    to?: string;
  }>(),
  { tone: 'default' },
);
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="stat-card"
    :class="[`stat-tone-${tone}`, { 'stat-card-link': Boolean(to) }]"
  >
    <div class="stat-top">
      <span class="stat-label">{{ label }}</span>
      <span v-if="icon" class="stat-icon" :class="`tone-${tone}`">
        <Icon :name="icon" :size="15" />
      </span>
    </div>
    <span class="stat-value tabular">{{ value }}</span>
    <ProgressBar
      v-if="progress !== undefined"
      :value="progress"
      :tone="tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'accent'"
      size="sm"
    />
    <span v-if="note" class="stat-note">{{ note }}</span>
  </component>
</template>
