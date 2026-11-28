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
import { useUnsavedGuard } from '../composables/useUnsavedGuard';
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
const editorMode = ref<'write' | 'split' | 'preview'>('write');
const creating = ref(false);
const mobileEditorOpen = ref(false);
const editorTextarea = ref<HTMLTextAreaElement | null>(null);

interface NoteDraft {
  title: string;
  relatedType: NoteRelatedType;
  relatedId: string;
  contentMarkdown: string;
  savedAt: string;
}

const availableDraft = ref<NoteDraft | null>(null);
const draftKey = computed(() => `lr-note-draft:${selectedId.value ?? 'new'}`);

function readDraft(key: string): NoteDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NoteDraft>;
    if (typeof parsed.title !== 'string' || typeof parsed.contentMarkdown !== 'string') return null;
    return {
      title: parsed.title,
      relatedType: (parsed.relatedType as NoteRelatedType) ?? 'general',
      relatedId: typeof parsed.relatedId === 'string' ? parsed.relatedId : '',
      contentMarkdown: parsed.contentMarkdown,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

function clearDraft(key = draftKey.value) {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(key);
  }
  availableDraft.value = null;
}

function checkDraftForCurrent() {
  const draft = readDraft(draftKey.value);
  if (
    draft &&
    (draft.title !== form.title ||
      draft.contentMarkdown !== form.contentMarkdown ||
      draft.relatedType !== form.relatedType ||
      draft.relatedId !== form.relatedId)
  ) {
    availableDraft.value = draft;
  } else {
    availableDraft.value = null;
  }
}

function restoreDraft() {
  if (!availableDraft.value) return;
  form.title = availableDraft.value.title;
  form.relatedType = availableDraft.value.relatedType;
  form.relatedId = availableDraft.value.relatedId;
  form.contentMarkdown = availableDraft.value.contentMarkdown;
  availableDraft.value = null;
  toast.info(t('notes.draftRestored'));
}

const form = reactive({
  title: '',
  relatedType: 'general' as NoteRelatedType,
  relatedId: '',
  contentMarkdown: '',
});

const savedSnapshot = reactive({
  title: '',
  relatedType: 'general' as NoteRelatedType,
  relatedId: '',
  contentMarkdown: '',
});

const isDirty = computed(
  () =>
    showEditor.value &&
    (form.title !== savedSnapshot.title ||
      form.relatedType !== savedSnapshot.relatedType ||
      form.relatedId !== savedSnapshot.relatedId ||
      form.contentMarkdown !== savedSnapshot.contentMarkdown),
);

useUnsavedGuard(isDirty);

watch(
  [() => form.title, () => form.relatedType, () => form.relatedId, () => form.contentMarkdown],
  () => {
    if (!showEditor.value || typeof window === 'undefined') return;
    if (isDirty.value) {
      const payload: NoteDraft = {
        title: form.title,
        relatedType: form.relatedType,
        relatedId: form.relatedId,
        contentMarkdown: form.contentMarkdown,
        savedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(draftKey.value, JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors
      }
    }
  },
);

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

function noteExcerpt(markdown: string): string {
  const clean = markdown
    .replace(/^#+\s*/gm, '')
    .replace(/[`*_>-]/g, '')
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  return clean ?? '';
}

function syncSnapshot() {
  savedSnapshot.title = form.title;
  savedSnapshot.relatedType = form.relatedType;
  savedSnapshot.relatedId = form.relatedId;
  savedSnapshot.contentMarkdown = form.contentMarkdown;
}

function insertSnippet(before: string, after = '', placeholder = '') {
  const el = editorTextarea.value;
  if (!el) {
    form.contentMarkdown += `${before}${placeholder}${after}`;
    return;
  }
  const start = el.selectionStart ?? form.contentMarkdown.length;
  const end = el.selectionEnd ?? start;
  const selected = form.contentMarkdown.slice(start, end) || placeholder;
  form.contentMarkdown =
    form.contentMarkdown.slice(0, start) +
    before +
    selected +
    after +
    form.contentMarkdown.slice(end);
  window.requestAnimationFrame(() => {
    el.focus();
    const cursor = start + before.length + selected.length;
    el.setSelectionRange(cursor, cursor);
  });
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
        await selectNote(note, true);
        mobileEditorOpen.value = true;
        return;
      }
    }
    if (queryType) {
      await startNew(queryType, queryRelatedId, true);
      mobileEditorOpen.value = true;
      return;
    }
    if (notes.value[0]) {
      await selectNote(notes.value[0], true, false);
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.notesLoad');
  } finally {
    loading.value = false;
  }
}

async function confirmSwitchIfDirty(): Promise<boolean> {
  if (!isDirty.value) return true;
  return confirmAction({
    title: t('common.unsavedLeaveTitle'),
    message: t('common.unsavedLeaveText'),
    confirmLabel: t('common.discardAndLeave'),
    danger: true,
  });
}

async function selectNote(note: LearningNote, force = false, openOnMobile = true) {
  if (!force && selectedId.value !== note.id && !(await confirmSwitchIfDirty())) return;
  selectedId.value = note.id;
  creating.value = false;
  form.title = note.title;
  form.relatedType = note.relatedType;
  form.relatedId = note.relatedId ? String(note.relatedId) : '';
  form.contentMarkdown = note.contentMarkdown;
  syncSnapshot();
  formError.value = '';
  checkDraftForCurrent();
  if (openOnMobile) {
    mobileEditorOpen.value = true;
  }
}

async function startNew(
  type: NoteRelatedType = 'general',
  relatedId: number | null = null,
  force = false,
) {
  if (!force && !(await confirmSwitchIfDirty())) return;
  selectedId.value = null;
  creating.value = true;
  form.title = '';
  form.relatedType = type;
  form.relatedId = relatedId ? String(relatedId) : '';
  form.contentMarkdown = '';
  formError.value = '';
  if (editorMode.value === 'preview') editorMode.value = 'write';
  if (type !== 'general' && !form.relatedId) {
    const options = optionsFor(type);
    if (options[0]) form.relatedId = String(options[0].id);
  }
  syncSnapshot();
  checkDraftForCurrent();
  mobileEditorOpen.value = true;
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
    const previousKey = draftKey.value;
    await loadNotes();
    clearDraft(previousKey);
    selectedId.value = saved.id;
    creating.value = false;
    syncSnapshot();
    clearDraft();
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
    clearDraft();
    toast.success(t('notes.deleted'));
    selectedId.value = null;
    creating.value = false;
    mobileEditorOpen.value = false;
    await loadNotes();
    if (notes.value[0]) await selectNote(notes.value[0], true, false);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
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

  <div v-else class="notes-layout" :class="{ 'mobile-editor-open': mobileEditorOpen }">
    <aside class="card notes-sidebar">
      <div class="stack-sm">
        <div class="input-wrap">
          <Icon name="search" :size="15" class="input-icon-left" />
          <input
            v-model="search"
            class="input input-sm input-has-left"
            :class="{ 'input-has-right': search }"
            type="search"
            :placeholder="$t('notes.searchPlaceholder')"
            :aria-label="$t('notes.searchAria')"
          />
          <button
            v-if="search"
            type="button"
            class="input-action-right"
            :aria-label="$t('common.clear')"
            @click="search = ''"
          >
            <Icon name="close" :size="13" />
          </button>
        </div>
        <select v-model="filterType" class="select input-sm" :aria-label="$t('notes.filterAria')">
          <option value="all">{{ $t('notes.allLinks') }}</option>
          <option v-for="type in NOTE_RELATED_TYPES" :key="type" :value="type">
            {{ noteRelatedTypeLabels[type] }}
          </option>
        </select>
      </div>

      <div class="divider" style="margin: 12px 0" />

      <div v-if="filteredNotes.length === 0">
        <EmptyState
          :title="$t('notes.emptyTitle')"
          :text="$t('notes.emptyText')"
          icon="notes"
        >
          <button type="button" class="btn btn-sm btn-primary" @click="startNew()">{{ $t('notes.newNote') }}</button>
        </EmptyState>
      </div>
      <ul v-else class="note-list">
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
          <span v-if="noteExcerpt(note.contentMarkdown)" class="note-list-excerpt">
            {{ noteExcerpt(note.contentMarkdown) }}
          </span>
          <span class="note-list-meta tabular">{{ relatedLabel(note) }} · {{ formatDateTime(note.updatedAt) }}</span>
        </li>
      </ul>
    </aside>

    <section class="card notes-editor-card" @keydown="handleEditorKeydown">
      <template v-if="showEditor">
        <div class="card-head wrap">
          <div>
            <button
              type="button"
              class="btn btn-ghost btn-sm notes-back-btn"
              style="margin-bottom: 8px; margin-left: -8px"
              @click="mobileEditorOpen = false"
            >
              <Icon name="chevron-left" :size="15" /> {{ $t('notes.backToList') }}
            </button>
            <div class="row" style="gap: 8px">
              <h2 class="card-title">{{ selectedId !== null ? $t('notes.editTitle') : $t('notes.newNote') }}</h2>
              <span v-if="isDirty" class="badge badge-warning">{{ $t('common.unsaved') }}</span>
            </div>
            <p class="card-hint">{{ $t('notes.previewHint') }}</p>
          </div>
          <div class="tabs">
            <button type="button" class="tab" :class="{ active: editorMode === 'write' }" @click="editorMode = 'write'">
              {{ $t('notes.writeTab') }}
            </button>
            <button type="button" class="tab notes-split-tab" :class="{ active: editorMode === 'split' }" @click="editorMode = 'split'">
              <Icon name="columns" :size="13" /> {{ $t('notes.splitTab') }}
            </button>
            <button type="button" class="tab" :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">
              {{ $t('notes.previewTab') }}
            </button>
          </div>
        </div>

        <div v-if="availableDraft" class="alert alert-info mb-12">
          <Icon name="info" :size="18" />
          <div class="alert-body">{{ $t('notes.draftFound') }}</div>
          <div class="row" style="gap: 6px">
            <button type="button" class="btn btn-sm btn-primary" @click="restoreDraft">
              {{ $t('notes.restoreDraft') }}
            </button>
            <button type="button" class="btn btn-sm" @click="clearDraft()">
              {{ $t('notes.dismissDraft') }}
            </button>
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
            <div>
              <div class="md-toolbar">
                <div class="row" style="gap: 2px">
                  <button type="button" class="md-tool-btn" @click="insertSnippet('## ', '', 'Heading')">
                    {{ $t('notes.toolbarHeading') }}
                  </button>
                  <button type="button" class="md-tool-btn" @click="insertSnippet('**', '**', 'bold')">
                    {{ $t('notes.toolbarBold') }}
                  </button>
                  <button type="button" class="md-tool-btn" @click="insertSnippet('\n```\n', '\n```\n', 'code')">
                    {{ $t('notes.toolbarCode') }}
                  </button>
                  <button type="button" class="md-tool-btn" @click="insertSnippet('\n- ', '', 'item')">
                    {{ $t('notes.toolbarList') }}
                  </button>
                </div>
                <span class="kbd kbd-desktop-only">{{ $t('notes.saveShortcut') }}</span>
              </div>
              <textarea
                id="note-content"
                ref="editorTextarea"
                v-model="form.contentMarkdown"
                class="textarea mono md-editor-textarea"
                style="min-height: 330px"
                :placeholder="$t('notes.contentPlaceholder')"
              />
            </div>
          </div>

          <div v-else-if="editorMode === 'split'" class="notes-split">
            <div class="field">
              <label class="field-label" for="note-content-split">{{ $t('notes.writeTab') }}</label>
              <div>
                <div class="md-toolbar">
                  <div class="row" style="gap: 2px">
                    <button type="button" class="md-tool-btn" @click="insertSnippet('## ', '', 'Heading')">H2</button>
                    <button type="button" class="md-tool-btn" @click="insertSnippet('**', '**', 'bold')">B</button>
                    <button type="button" class="md-tool-btn" @click="insertSnippet('`', '`', 'code')">Code</button>
                    <button type="button" class="md-tool-btn" @click="insertSnippet('\n- ', '', 'item')">List</button>
                  </div>
                  <span class="kbd kbd-desktop-only">Ctrl+S</span>
                </div>
                <textarea
                  id="note-content-split"
                  ref="editorTextarea"
                  v-model="form.contentMarkdown"
                  class="textarea mono md-editor-textarea"
                  style="min-height: 330px"
                  :placeholder="$t('notes.contentPlaceholder')"
                />
              </div>
            </div>
            <div class="field">
              <span class="field-label">{{ $t('notes.previewTab') }}</span>
              <div class="notes-preview-pane">
                <MarkdownView :content="form.contentMarkdown" />
              </div>
            </div>
          </div>

          <div v-else class="notes-preview-pane" style="min-height: 360px">
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
