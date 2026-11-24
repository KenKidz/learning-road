<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import type {
  CourseSummary,
  InterviewTopic,
  LearningNote,
  NoteRelatedType,
  Project,
  Task,
} from '@shared/types';
import { NOTE_RELATED_TYPES } from '@shared/types';
import { api, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { noteRelatedTypeLabels } from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MarkdownView from '../components/MarkdownView.vue';
import Icon from '../components/Icon.vue';

interface RelatedOption {
  id: number;
  label: string;
}

const toast = useToast();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const notes = ref<LearningNote[]>([]);
const courses = ref<CourseSummary[]>([]);
const tasks = ref<Task[]>([]);
const projects = ref<Project[]>([]);
const interviewTopics = ref<InterviewTopic[]>([]);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const formError = ref('');
const selectedId = ref<number | null>(null);
const filterType = ref('all');
const search = ref('');
const editorMode = ref<'write' | 'preview'>('write');
const creating = ref(false);

const form = reactive({
  title: '',
  relatedType: 'general' as NoteRelatedType,
  relatedId: '',
  contentMarkdown: '',
});

const filteredNotes = computed(() => {
  const query = search.value.trim().toLowerCase();
  return notes.value.filter((note) => {
    if (filterType.value !== 'all' && note.relatedType !== filterType.value) return false;
    if (query) {
      const haystack = `${note.title} ${note.contentMarkdown}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
});

const relatedOptions = computed<RelatedOption[]>(() => optionsFor(form.relatedType));
const showEditor = computed(() => selectedId.value !== null || creating.value);

function optionsFor(type: NoteRelatedType): RelatedOption[] {
  if (type === 'course') {
    return courses.value.map((course) => ({ id: course.id, label: course.title }));
  }
  if (type === 'task') {
    return tasks.value.map((task) => ({ id: task.id, label: task.title }));
  }
  if (type === 'project') {
    return projects.value.map((project) => ({ id: project.id, label: project.name }));
  }
  if (type === 'interview_topic') {
    return interviewTopics.value.map((topic) => ({ id: topic.id, label: topic.name }));
  }
  return [];
}

function relatedLabel(note: LearningNote): string {
  if (note.relatedType === 'general') return t('notes.general');
  const option = optionsFor(note.relatedType).find((item) => item.id === note.relatedId);
  return option ? `${noteRelatedTypeLabels[note.relatedType]}: ${option.label}` : noteRelatedTypeLabels[note.relatedType];
}

async function loadReferences() {
  const [coursesResponse, tasksResponse, projectsResponse, interviewResponse] = await Promise.all([
    api.courses(),
    api.tasks({ scope: 'all' }),
    api.projects(),
    api.interview(),
  ]);
  courses.value = coursesResponse.courses;
  tasks.value = tasksResponse.tasks;
  projects.value = projectsResponse.projects;
  interviewTopics.value = interviewResponse.topics;
}

async function loadNotes() {
  const response = await api.notes();
  notes.value = response.notes;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadReferences(), loadNotes()]);
    const queryType =
      typeof route.query.relatedType === 'string' &&
      (NOTE_RELATED_TYPES as readonly string[]).includes(route.query.relatedType)
        ? (route.query.relatedType as NoteRelatedType)
        : null;
    const queryRelatedId =
      typeof route.query.relatedId === 'string' ? Number(route.query.relatedId) : null;
    const queryNoteId =
      typeof route.query.noteId === 'string' ? Number(route.query.noteId) : null;

    if (queryNoteId) {
      const note = notes.value.find((item) => item.id === queryNoteId);
      if (note) {
        selectNote(note);
        return;
      }
    }
    if (queryType) {
      startNew(queryType, queryRelatedId);
      return;
    }
    if (notes.value[0]) selectNote(notes.value[0]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.notesLoad');
  } finally {
    loading.value = false;
  }
}

function selectNote(note: LearningNote) {
  selectedId.value = note.id;
  creating.value = false;
  form.title = note.title;
  form.relatedType = note.relatedType;
  form.relatedId = note.relatedId ? String(note.relatedId) : '';
  form.contentMarkdown = note.contentMarkdown;
  formError.value = '';
  editorMode.value = 'write';
}

function startNew(type: NoteRelatedType = 'general', relatedId: number | null = null) {
  selectedId.value = null;
  creating.value = true;
  form.title = '';
  form.relatedType = type;
  form.relatedId = relatedId ? String(relatedId) : '';
  form.contentMarkdown = '';
  formError.value = '';
  editorMode.value = 'write';
  if (type !== 'general' && !form.relatedId) {
    const options = optionsFor(type);
    if (options[0]) form.relatedId = String(options[0].id);
  }
}

async function save() {
  if (!form.title.trim()) {
    formError.value = t('notes.titleRequired');
    return;
  }
  if (form.relatedType !== 'general' && !form.relatedId) {
    formError.value = t('notes.relatedRequired');
    return;
  }
  busy.value = true;
  formError.value = '';
  try {
    const payload = {
      title: form.title.trim(),
      contentMarkdown: form.contentMarkdown,
      relatedType: form.relatedType,
      relatedId: form.relatedType === 'general' || !form.relatedId ? null : Number(form.relatedId),
    };
    let saved: LearningNote;
    if (selectedId.value !== null) {
      saved = await api.updateNote(selectedId.value, payload);
      toast.success(t('notes.saved'));
    } else {
      saved = await api.createNote(payload);
      toast.success(t('notes.created'));
    }
    await loadNotes();
    selectedId.value = saved.id;
    creating.value = false;
    if (typeof route.query.noteId === 'string' || typeof route.query.relatedType === 'string') {
      await router.replace({ path: '/notes' });
    }
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function removeNote() {
  if (selectedId.value === null) return;
  const confirmed = await confirmAction({
    title: t('notes.deleteTitle'),
    message: t('notes.deleteText'),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteNote(selectedId.value);
    toast.success(t('notes.deleted'));
    selectedId.value = null;
    creating.value = false;
    await loadNotes();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

watch(
  () => form.relatedType,
  (type) => {
    const options = optionsFor(type);
    if (!options.some((option) => String(option.id) === form.relatedId)) {
      form.relatedId = options[0] ? String(options[0].id) : '';
    }
  },
);

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.notes')"
    :subtitle="$t('notes.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <button type="button" class="btn btn-primary" @click="startNew()">
        <Icon name="plus" :size="16" /> {{ $t('notes.newNote') }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loading" class="skeleton" style="height: 420px" />

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.notesLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <div v-else class="notes-layout">
    <aside class="card" style="padding: 14px">
      <div class="stack-sm">
        <input
          v-model="search"
          class="input"
          type="search"
          :placeholder="$t('notes.searchPlaceholder')"
          :aria-label="$t('notes.searchAria')"
        />
        <select v-model="filterType" class="select" :aria-label="$t('notes.filterAria')">
          <option value="all">{{ $t('notes.allLinks') }}</option>
          <option v-for="type in NOTE_RELATED_TYPES" :key="type" :value="type">
            {{ noteRelatedTypeLabels[type] }}
          </option>
        </select>
      </div>

      <div class="divider" />

      <div v-if="filteredNotes.length === 0">
        <EmptyState
          :title="$t('notes.emptyTitle')"
          :text="$t('notes.emptyText')"
          icon="notes"
        >
          <button type="button" class="btn btn-sm btn-primary" @click="startNew()">{{ $t('notes.newNote') }}</button>
        </EmptyState>
      </div>
      <ul v-else>
        <li
          v-for="note in filteredNotes"
          :key="note.id"
          class="note-list-item"
          :class="{ active: selectedId === note.id }"
          role="button"
          tabindex="0"
          @click="selectNote(note)"
          @keydown.enter="selectNote(note)"
        >
          <span class="note-list-title">{{ note.title }}</span>
          <span class="note-list-meta">{{ relatedLabel(note) }} · {{ formatDateTime(note.updatedAt) }}</span>
        </li>
      </ul>
    </aside>

    <section class="card">
      <template v-if="showEditor">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ selectedId !== null ? $t('notes.editTitle') : $t('notes.newNote') }}</h2>
            <p class="card-hint">{{ $t('notes.previewHint') }}</p>
          </div>
          <div class="row" style="gap: 4px">
            <div class="tabs">
              <button type="button" class="tab" :class="{ active: editorMode === 'write' }" @click="editorMode = 'write'">
                {{ $t('notes.writeTab') }}
              </button>
              <button type="button" class="tab" :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">
                {{ $t('notes.previewTab') }}
              </button>
            </div>
          </div>
        </div>

        <form class="stack" @submit.prevent="save">
          <div class="form-grid">
            <div class="field span-2">
              <label class="field-label" for="note-title">{{ $t('notes.titleField') }}</label>
              <input id="note-title" v-model="form.title" class="input" required />
            </div>
            <div class="field">
              <label class="field-label" for="note-related-type">{{ $t('notes.relatedType') }}</label>
              <select id="note-related-type" v-model="form.relatedType" class="select">
                <option v-for="type in NOTE_RELATED_TYPES" :key="type" :value="type">
                  {{ noteRelatedTypeLabels[type] }}
                </option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="note-related-id">{{ $t('notes.relatedObject') }}</label>
              <select
                id="note-related-id"
                v-model="form.relatedId"
                class="select"
                :disabled="form.relatedType === 'general'"
              >
                <option v-if="form.relatedType === 'general'" value="">{{ $t('notes.noLink') }}</option>
                <option v-for="option in relatedOptions" :key="option.id" :value="String(option.id)">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div v-if="editorMode === 'write'" class="field">
            <label class="field-label" for="note-content">{{ $t('notes.content') }}</label>
            <textarea
              id="note-content"
              v-model="form.contentMarkdown"
              class="textarea mono"
              style="min-height: 300px"
              :placeholder="$t('notes.contentPlaceholder')"
            />
          </div>
          <div v-else class="card compact" style="min-height: 300px">
            <MarkdownView :content="form.contentMarkdown" />
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="row-between wrap">
            <button
              v-if="selectedId !== null"
              type="button"
              class="btn btn-danger"
              @click="removeNote"
            >
              <Icon name="trash" :size="15" /> {{ $t('notes.deleteNote') }}
            </button>
            <span v-else />
            <button type="submit" class="btn btn-primary" :disabled="busy">
              <span v-if="busy" class="spinner" /> {{ $t('notes.saveNote') }}
            </button>
          </div>
        </form>
      </template>

      <EmptyState
        v-else
        :title="$t('notes.selectTitle')"
        :text="$t('notes.selectText')"
        icon="notes"
      >
        <button type="button" class="btn btn-primary btn-sm" @click="startNew()">{{ $t('notes.newNote') }}</button>
      </EmptyState>
    </section>
  </div>
</template>
