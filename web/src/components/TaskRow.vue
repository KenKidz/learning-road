<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { Task } from '@shared/types';
import Icon from './Icon.vue';
import { badgeToneForPriority, priorityLabels, taskTypeLabels } from '../lib/labels';
import { formatMinutes, relativeDayLabel } from '../lib/format';

const props = defineProps<{
  task: Task;
  today: string;
  showDate?: boolean;
  showStart?: boolean;
  showLogSession?: boolean;
  showFocus?: boolean;
  hideEdit?: boolean;
}>();

const emit = defineEmits<{
  toggle: [task: Task];
  edit: [task: Task];
  remove: [task: Task];
  start: [task: Task];
  logSession: [task: Task];
  focus: [task: Task];
}>();

const isDone = computed(() => props.task.status === 'done');
const cancelled = computed(() => props.task.status === 'cancelled');
const isInProgress = computed(() => props.task.status === 'in_progress');
const isOverdue = computed(
  () =>
    Boolean(props.task.plannedDate && props.task.plannedDate < props.today) &&
    !isDone.value &&
    !cancelled.value,
);

function toggle() {
  if (cancelled.value) return;
  emit('toggle', props.task);
}
</script>

<template>
  <div
    class="task-row"
    :class="{ done: isDone, cancelled, 'in-progress': isInProgress, overdue: isOverdue }"
  >
    <input
      class="task-check"
      type="checkbox"
      :checked="isDone"
      :disabled="cancelled"
      :aria-label="$t('taskRow.toggleAria', { title: task.title })"
      @change="toggle"
    />
    <div class="grow">
      <div class="row wrap" style="gap: 6px">
        <p class="task-title">{{ task.title }}</p>
        <span v-if="isInProgress" class="badge badge-info">{{ $t('labels.taskStatus.in_progress') }}</span>
        <span v-if="cancelled" class="badge badge-neutral">{{ $t('labels.taskStatus.cancelled') }}</span>
      </div>
      <div class="task-sub">
        <RouterLink
          v-if="task.relatedCourseId"
          class="chip chip-link"
          :to="`/roadmap/${task.relatedCourseId}`"
        >
          {{ task.courseTitle ?? $t('course.courseLink') }}
        </RouterLink>
        <span v-if="task.projectName" class="chip">{{ task.projectName }}</span>
        <span class="badge" :class="`badge-${badgeToneForPriority(task.priority)}`">
          {{ priorityLabels[task.priority] }}
        </span>
        <span class="badge badge-outline">{{ taskTypeLabels[task.type] }}</span>
        <span v-if="task.estimatedMinutes" class="nowrap tabular">
          ~{{ formatMinutes(task.estimatedMinutes) }}
        </span>
        <span v-if="task.actualMinutes > 0" class="nowrap tabular">
          {{ $t('taskRow.actual', { duration: formatMinutes(task.actualMinutes) }) }}
        </span>
        <span
          v-if="showDate && task.plannedDate"
          class="nowrap tabular"
          :class="{ 'text-danger': isOverdue }"
        >
          {{ relativeDayLabel(task.plannedDate, today) }}
        </span>
      </div>
    </div>
    <div class="task-actions">
      <button
        v-if="showStart && !isDone && !cancelled"
        type="button"
        class="btn btn-ghost btn-icon btn-sm"
        :class="{ 'text-info': isInProgress }"
        :title="isInProgress ? $t('taskRow.pause') : $t('taskRow.start')"
        :aria-label="isInProgress ? $t('taskRow.pause') : $t('taskRow.start')"
        @click="emit('start', task)"
      >
        <Icon name="play" :size="14" />
      </button>
      <button
        v-if="showFocus && !isDone && !cancelled"
        type="button"
        class="btn btn-ghost btn-icon btn-sm"
        :title="$t('taskRow.focus')"
        :aria-label="$t('taskRow.focus')"
        @click="emit('focus', task)"
      >
        <Icon name="timer" :size="14" />
      </button>
      <button
        v-if="showLogSession && !cancelled"
        type="button"
        class="btn btn-ghost btn-icon btn-sm"
        :title="$t('taskRow.logSession')"
        :aria-label="$t('taskRow.logSession')"
        @click="emit('logSession', task)"
      >
        <Icon name="clock" :size="14" />
      </button>
      <button
        v-if="!hideEdit"
        type="button"
        class="btn btn-ghost btn-icon btn-sm"
        :title="$t('taskRow.edit')"
        :aria-label="$t('taskRow.edit')"
        @click="emit('edit', task)"
      >
        <Icon name="edit" :size="15" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-icon btn-sm btn-danger-hover"
        :title="$t('taskRow.delete')"
        :aria-label="$t('taskRow.delete')"
        @click="emit('remove', task)"
      >
        <Icon name="trash" :size="15" />
      </button>
    </div>
  </div>
</template>
