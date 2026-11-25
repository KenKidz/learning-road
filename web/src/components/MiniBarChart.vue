<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatMinutes } from '../lib/format';

const props = defineProps<{
  items: { date: string; minutes: number }[];
  dailyGoalMinutes?: number;
  today?: string;
}>();

const { t } = useI18n();
const maxMinutes = computed(() =>
  Math.max(60, props.dailyGoalMinutes ?? 0, ...props.items.map((item) => item.minutes)),
);

const goalPercent = computed(() => {
  if (!props.dailyGoalMinutes || props.dailyGoalMinutes <= 0) return null;
  return Math.min(100, Math.round((props.dailyGoalMinutes / maxMinutes.value) * 100));
});

function weekday(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  return t(`weekdays.d${date.getUTCDay()}`);
}

function heightPercent(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.max(4, Math.round((minutes / maxMinutes.value) * 100));
}
</script>

<template>
  <div class="bar-chart-wrap">
    <div class="bar-chart" role="img" :aria-label="t('chart.aria')">
      <div
        v-if="goalPercent !== null"
        class="bar-goal-line"
        :style="{ bottom: `${22 + (goalPercent / 100) * 96}px` }"
      >
        <span class="bar-goal-label tabular">{{ formatMinutes(dailyGoalMinutes) }}</span>
      </div>
      <div
        v-for="item in items"
        :key="item.date"
        class="bar-col"
        :class="{
          'is-today': today && item.date === today,
          'is-goal-met': dailyGoalMinutes && dailyGoalMinutes > 0 && item.minutes >= dailyGoalMinutes,
        }"
      >
        <span class="bar-value tabular">{{ item.minutes > 0 ? item.minutes : '' }}</span>
        <div
          class="bar-track"
          :title="t('chart.tooltip', { date: item.date, minutes: item.minutes })"
        >
          <div
            class="bar-fill"
            :class="{ empty: item.minutes === 0 }"
            :style="{ height: item.minutes > 0 ? `${heightPercent(item.minutes)}%` : '2px' }"
          />
        </div>
        <span class="bar-label">{{ weekday(item.date) }}</span>
      </div>
    </div>
  </div>
</template>
