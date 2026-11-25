<script setup lang="ts" generic="T extends { id: number }">
import { ref } from 'vue';

export interface KanbanColumn {
  key: string;
  label: string;
  tone?: string;
}

const props = defineProps<{
  columns: KanbanColumn[];
  items: T[];
  getColumn: (item: T) => string;
}>();

const emit = defineEmits<{
  move: [payload: { item: T; toColumn: string }];
}>();

const draggingId = ref<number | null>(null);
const dragOverColumn = ref<string | null>(null);

function columnItems(colKey: string): T[] {
  return props.items.filter((item) => props.getColumn(item) === colKey);
}

function onDragStart(item: T, event: DragEvent) {
  draggingId.value = item.id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(item.id));
  }
}

function onDragEnd() {
  draggingId.value = null;
  dragOverColumn.value = null;
}

function onDragOver(colKey: string, event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverColumn.value = colKey;
}

function onDragLeave(colKey: string) {
  if (dragOverColumn.value === colKey) {
    dragOverColumn.value = null;
  }
}

function onDrop(colKey: string, event: DragEvent) {
  event.preventDefault();
  dragOverColumn.value = null;
  const rawId = event.dataTransfer?.getData('text/plain');
  const id = rawId ? Number(rawId) : draggingId.value;
  draggingId.value = null;
  if (id === null || !Number.isFinite(id)) return;
  const item = props.items.find((entry) => entry.id === id);
  if (!item || props.getColumn(item) === colKey) return;
  emit('move', { item, toColumn: colKey });
}

function moveTo(item: T, toColumn: string) {
  if (props.getColumn(item) === toColumn) return;
  emit('move', { item, toColumn });
}
</script>

<template>
  <div class="kanban-board">
    <section
      v-for="col in columns"
      :key="col.key"
      class="kanban-col"
      :class="{ 'is-drag-over': dragOverColumn === col.key }"
      @dragover="onDragOver(col.key, $event)"
      @dragleave="onDragLeave(col.key)"
      @drop="onDrop(col.key, $event)"
    >
      <header class="kanban-col-head">
        <span class="badge" :class="col.tone ? `badge-${col.tone}` : 'badge-neutral'">
          {{ col.label }}
        </span>
        <span class="muted tabular">{{ columnItems(col.key).length }}</span>
      </header>

      <div class="kanban-col-body">
        <div
          v-for="item in columnItems(col.key)"
          :key="item.id"
          class="kanban-card"
          :class="{ 'is-dragging': draggingId === item.id }"
          draggable="true"
          @dragstart="onDragStart(item, $event)"
          @dragend="onDragEnd"
        >
          <slot name="card" :item="item" :columns="columns" :move-to="moveTo" />
        </div>
        <div v-if="columnItems(col.key).length === 0" class="kanban-empty muted">
          {{ $t('common.noItems') }}
        </div>
      </div>
    </section>
  </div>
</template>
