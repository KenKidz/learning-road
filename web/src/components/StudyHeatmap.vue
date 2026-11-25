<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { AnalyticsHeatmapDay } from '@shared/types';
import { addDays, formatDate, formatMinutes, startOfWeek } from '../lib/format';

interface HeatmapCell {
  date: string;
  minutes: number;
  sessionsCount: number;
  level: 0 | 1 | 2 | 3 | 4;
  outside: boolean;
}

const props = defineProps<{
  days: AnalyticsHeatmapDay[];
  today?: string;
}>();

const router = useRouter();
const { t } = useI18n();

const weeks = computed<HeatmapCell[][]>(() => {
  if (props.days.length === 0) return [];
  const firstDate = props.days[0]!.date;
  const lastDate = props.days[props.days.length - 1]!.date;
  const gridStart = startOfWeek(firstDate);

  const byDate = new Map(props.days.map((d) => [d.date, d]));
  const columns: HeatmapCell[][] = [];
  let cursor = gridStart;

  while (cursor <= lastDate) {
    const col: HeatmapCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const d = addDays(cursor, row);
      const item = byDate.get(d);
      col.push({
        date: d,
        minutes: item?.minutes ?? 0,
        sessionsCount: item?.sessionsCount ?? 0,
        level: item?.level ?? 0,
        outside: !item,
      });
    }
    columns.push(col);
    cursor = addDays(cursor, 7);
  }
  return columns;
});

function monthLabel(col: HeatmapCell[], index: number): string {
  const firstInBounds = col.find((c) => !c.outside);
  if (!firstInBounds) return '';
  const month = firstInBounds.date.slice(0, 7);
  if (index === 0) return firstInBounds.date.slice(5, 7);
  const prevCol = weeks.value[index - 1];
  const prevFirst = prevCol?.find((c) => !c.outside);
  if (prevFirst && prevFirst.date.slice(0, 7) === month) return '';
  return firstInBounds.date.slice(5, 7);
}

function cellTitle(cell: HeatmapCell): string {
  if (cell.outside) return '';
  return t('analytics.heatmapTooltip', {
    date: formatDate(cell.date),
    duration: formatMinutes(cell.minutes),
    sessions: cell.sessionsCount,
  });
}

function openDay(cell: HeatmapCell) {
  if (cell.outside) return;
  void router.push({ path: '/planner', query: { date: cell.date } });
}
</script>

<template>
  <div class="heatmap-wrap">
    <div class="heatmap-scroll">
      <div class="heatmap-grid-outer">
        <div class="heatmap-weekdays" aria-hidden="true">
          <span>{{ $t('weekdays.d1') }}</span>
          <span></span>
          <span>{{ $t('weekdays.d3') }}</span>
          <span></span>
          <span>{{ $t('weekdays.d5') }}</span>
          <span></span>
          <span>{{ $t('weekdays.d0') }}</span>
        </div>

        <div>
          <div class="heatmap-months" aria-hidden="true">
            <span
              v-for="(col, idx) in weeks"
              :key="`m-${idx}`"
              class="heatmap-month-cell tabular"
            >
              {{ monthLabel(col, idx) }}
            </span>
          </div>

          <div class="heatmap-cols" role="grid" :aria-label="$t('analytics.heatmapAria')">
            <div v-for="(col, colIdx) in weeks" :key="colIdx" class="heatmap-col">
              <button
                v-for="cell in col"
                :key="cell.date"
                type="button"
                class="heatmap-cell"
                :class="[
                  `level-${cell.level}`,
                  { 'is-outside': cell.outside, 'is-today': today && cell.date === today },
                ]"
                :disabled="cell.outside"
                :title="cellTitle(cell)"
                :aria-label="cellTitle(cell)"
                @click="openDay(cell)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row-between wrap mt-8" style="gap: 8px">
      <span class="muted">{{ $t('analytics.heatmapClickHint') }}</span>
      <div class="row" style="gap: 4px">
        <span class="muted">{{ $t('analytics.less') }}</span>
        <span class="heatmap-cell level-0" aria-hidden="true" />
        <span class="heatmap-cell level-1" aria-hidden="true" />
        <span class="heatmap-cell level-2" aria-hidden="true" />
        <span class="heatmap-cell level-3" aria-hidden="true" />
        <span class="heatmap-cell level-4" aria-hidden="true" />
        <span class="muted">{{ $t('analytics.more') }}</span>
      </div>
    </div>
  </div>
</template>
