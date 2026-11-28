<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AnalyticsWeeklyPoint } from '@shared/types';
import { formatDate, formatMinutes } from '../lib/format';

const props = defineProps<{
  items: AnalyticsWeeklyPoint[];
  weeklyGoalMinutes: number;
}>();

const { t } = useI18n();

const maxMinutes = computed(() =>
  Math.max(
    60,
    props.weeklyGoalMinutes || 0,
    ...props.items.map((item) => item.minutes),
  ),
);

const goalPercent = computed(() => {
  if (!props.weeklyGoalMinutes || props.weeklyGoalMinutes <= 0) return null;
  return Math.min(100, Math.round((props.weeklyGoalMinutes / maxMinutes.value) * 100));
});

function heightPercent(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.max(4, Math.round((minutes / maxMinutes.value) * 100));
}

function shortWeekLabel(weekStart: string): string {
  return `${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)}`;
}

function tooltip(item: AnalyticsWeeklyPoint): string {
  return t('analytics.weeklyTooltip', {
    week: formatDate(item.weekStart),
    duration: formatMinutes(item.minutes),
    tasks: item.tasksCompleted,
  });
}
</script>

<template>
  <div class="bar-chart-wrap">
    <div
      v-if="goalPercent !== null"
      class="bar-goal-line"
      :style="{ bottom: `${26 + (goalPercent / 100) * 96}px` }"
    >
      <span class="bar-goal-label tabular">{{ formatMinutes(weeklyGoalMinutes) }}</span>
    </div>
    <div class="bar-chart trend-chart" role="img" :aria-label="$t('analytics.weeklyAria')">
      <div
        v-for="(item, idx) in items"
        :key="item.weekStart"
        class="bar-col"
        :class="{
          'is-today': idx === items.length - 1,
          'is-goal-met': weeklyGoalMinutes > 0 && item.minutes >= weeklyGoalMinutes,
        }"
      >
        <span class="bar-value tabular">{{ item.minutes > 0 ? Math.round(item.minutes / 60 * 10) / 10 + 'h' : '' }}</span>
        <div class="bar-track" :title="tooltip(item)">
          <div
            class="bar-fill"
            :class="{ empty: item.minutes === 0 }"
            :style="{ height: item.minutes > 0 ? `${heightPercent(item.minutes)}%` : '2px' }"
          />
        </div>
        <span class="bar-label tabular">{{ shortWeekLabel(item.weekStart) }}</span>
      </div>
    </div>
  </div>
</template>
