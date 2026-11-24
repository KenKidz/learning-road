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
}>();

const emit = defineEmits<{
  toggle: [task: Task];
  edit: [task: Task];
  remove: [task: Task];
}>();

const isDone = computed(() => props.task.status === 'done');
const cancelled = computed(() => props.task.status === 'cancelled');

function toggle() {
  if (cancelled.value) return;
  emit('toggle', props.task);
}
</script>

<template>
  <div class="task-row" :class="{ done: isDone }">
    <input
      class="task-check"
      type="checkbox"
      :checked="isDone"
      :disabled="cancelled"
      :aria-label="$t('taskRow.toggleAria', { title: task.title })"
      @change="toggle"
    />
    <div class="grow">
      <p class="task-title">{{ task.title }}</p>
      <div class="task-sub">
        <RouterLink
          v-if="task.relatedCourseId"
          class="chip"
          :to="`/roadmap/${task.relatedCourseId}`"
        >
          {{ task.courseTitle ?? $t('course.courseLink') }}
        </RouterLink>
        <span v-if="task.projectName" class="chip">{{ task.projectName }}</span>
        <span class="badge" :class="`badge-${badgeToneForPriority(task.priority)}`">
          {{ priorityLabels[task.priority] }}
        </span>
        <span>{{ taskTypeLabels[task.type] }}</span>
        <span v-if="task.estimatedMinutes" class="nowrap">
          ~{{ formatMinutes(task.estimatedMinutes) }}
        </span>
        <span v-if="task.actualMinutes > 0" class="nowrap">
          {{ $t('taskRow.actual', { duration: formatMinutes(task.actualMinutes) }) }}
        </span>
        <span v-if="showDate && task.plannedDate" class="nowrap">
          {{ relativeDayLabel(task.plannedDate, today) }}
        </span>
        <span v-if="task.status === 'in_progress'" class="text-success">{{ $t('labels.taskStatus.in_progress') }}</span>
        <span v-if="task.status === 'cancelled'" class="muted">{{ $t('labels.taskStatus.cancelled') }}</span>
      </div>
    </div>
    <div class="task-actions">
      <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('taskRow.edit')" @click="emit('edit', task)">
        <Icon name="edit" :size="15" />
      </button>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('taskRow.delete')" @click="emit('remove', task)">
        <Icon name="trash" :size="15" />
      </button>
    </div>
  </div>
</template>
