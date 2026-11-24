<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  items: { date: string; minutes: number }[];
}>();

const { t } = useI18n();
const maxMinutes = computed(() => Math.max(60, ...props.items.map((item) => item.minutes)));

function weekday(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  return t(`weekdays.d${date.getUTCDay()}`);
}
</script>

<template>
  <div class="bar-chart" role="img" :aria-label="t('chart.aria')">
    <div v-for="item in items" :key="item.date" class="bar-col">
      <span class="bar-value">{{ item.minutes > 0 ? item.minutes : '' }}</span>
      <div class="bar-track" :title="t('chart.tooltip', { date: item.date, minutes: item.minutes })">
        <div class="bar-fill" :style="{ height: `${(item.minutes / maxMinutes) * 100}%` }" />
      </div>
      <span class="bar-label">{{ weekday(item.date) }}</span>
    </div>
  </div>
</template>
