<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  FeatureStatus,
  Priority,
  Project,
  ProjectFeature,
  ProjectStatus,
} from '@shared/types';
import { FEATURE_STATUSES, PRIORITIES, PROJECT_STATUSES } from '@shared/types';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import {
  badgeToneForPriority,
  featureStatusLabels,
  priorityLabels,
  projectStatusLabels,
} from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import PageHeader from '../components/PageHeader.vue';
import ProgressBar from '../components/ProgressBar.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import Icon from '../components/Icon.vue';

const toast = useToast();
const { t } = useI18n();

const projects = ref<Project[]>([]);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const formError = ref('');
const showProjectModal = ref(false);
const showFeatureModal = ref(false);
const editingProject = ref<Project | null>(null);
const editingFeature = ref<ProjectFeature | null>(null);
const featureProjectId = ref<number | null>(null);
const newChecklist = reactive<Record<number, string>>({});

const projectForm = reactive({
  name: '',
  description: '',
  status: 'planned' as ProjectStatus,
  startedDate: '',
  targetDate: '',
});

const featureForm = reactive({
  title: '',
  description: '',
  status: 'not_started' as FeatureStatus,
  priority: 'high' as Priority,
  targetDate: '',
  notes: '',
});

function projectProgress(project: Project): number {
  if (project.features.length === 0) return 0;
  const done = project.features.filter((feature) => feature.status === 'completed').length;
  return Math.round((done / project.features.length) * 100);
}

function featureProgress(feature: ProjectFeature): number {
  if (feature.checklist.length === 0) return 0;
  return Math.round(
    (feature.checklist.filter((item) => item.done).length / feature.checklist.length) * 100,
  );
}

const totalFeatures = computed(() =>
  projects.value.reduce((total, project) => total + project.features.length, 0),
);
const completedFeatures = computed(() =>
  projects.value.reduce(
    (total, project) =>
      total + project.features.filter((feature) => feature.status === 'completed').length,
    0,
  ),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.projects();
    projects.value = response.projects;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.projectsLoad');
  } finally {
    loading.value = false;
  }
}

function openProjectCreate() {
  editingProject.value = null;
  projectForm.name = '';
  projectForm.description = '';
  projectForm.status = 'planned';
  projectForm.startedDate = '';
  projectForm.targetDate = '';
  formError.value = '';
  showProjectModal.value = true;
}

function openProjectEdit(project: Project) {
  editingProject.value = project;
  projectForm.name = project.name;
  projectForm.description = project.description;
  projectForm.status = project.status;
  projectForm.startedDate = project.startedAt ? project.startedAt.slice(0, 10) : '';
  projectForm.targetDate = project.targetDate ?? '';
  formError.value = '';
  showProjectModal.value = true;
}

async function saveProject() {
  if (!projectForm.name.trim()) {
    formError.value = t('projects.noName');
    return;
  }
  busy.value = true;
  formError.value = '';
  try {
    const payload = {
      name: projectForm.name.trim(),
      description: projectForm.description.trim(),
      status: projectForm.status,
      startedAt: projectForm.startedDate
        ? new Date(`${projectForm.startedDate}T00:00:00`).toISOString()
        : null,
      targetDate: projectForm.targetDate || null,
    };
    if (editingProject.value) {
      await api.updateProject(editingProject.value.id, payload);
      toast.success(t('projects.projectUpdated'));
    } else {
      await api.createProject(payload);
      toast.success(t('projects.projectCreated'));
    }
    showProjectModal.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function removeProject(project: Project) {
  const confirmed = await confirmAction({
    title: t('projects.deleteProjectTitle'),
    message: t('projects.deleteProjectText', { name: project.name }),
    confirmLabel: t('projects.deleteProject'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteProject(project.id);
    toast.success(t('projects.projectDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function openFeatureCreate(projectId: number) {
  editingFeature.value = null;
  featureProjectId.value = projectId;
  featureForm.title = '';
  featureForm.description = '';
  featureForm.status = 'not_started';
  featureForm.priority = 'high';
  featureForm.targetDate = '';
  featureForm.notes = '';
  formError.value = '';
  showFeatureModal.value = true;
}

function openFeatureEdit(feature: ProjectFeature) {
  editingFeature.value = feature;
  featureProjectId.value = feature.projectId;
  featureForm.title = feature.title;
  featureForm.description = feature.description;
  featureForm.status = feature.status;
  featureForm.priority = feature.priority;
  featureForm.targetDate = feature.targetDate ?? '';
  featureForm.notes = feature.notes;
  formError.value = '';
  showFeatureModal.value = true;
}

async function saveFeature() {
  if (!featureForm.title.trim() || featureProjectId.value === null) {
    formError.value = t('projects.noFeatureName');
    return;
  }
  busy.value = true;
  formError.value = '';
  try {
    const payload = {
      title: featureForm.title.trim(),
      description: featureForm.description.trim(),
      status: featureForm.status,
      priority: featureForm.priority,
      targetDate: featureForm.targetDate || null,
      notes: featureForm.notes.trim(),
    };
    if (editingFeature.value) {
      await api.updateFeature(editingFeature.value.id, payload);
      toast.success(t('projects.featureUpdated'));
    } else {
      await api.createFeature(featureProjectId.value, payload);
      toast.success(t('projects.featureCreated'));
    }
    showFeatureModal.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function updateFeatureStatus(feature: ProjectFeature, event: Event) {
  const status = (event.target as HTMLSelectElement).value as FeatureStatus;
  if (status === feature.status) return;
  try {
    await api.updateFeature(feature.id, { status });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function toggleChecklist(feature: ProjectFeature, index: number) {
  const checklist = feature.checklist.map((item, itemIndex) =>
    itemIndex === index ? { ...item, done: !item.done } : item,
  );
  try {
    await api.updateFeature(feature.id, { checklist });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function addChecklistItem(feature: ProjectFeature) {
  const label = (newChecklist[feature.id] ?? '').trim();
  if (!label) return;
  try {
    await api.updateFeature(feature.id, {
      checklist: [...feature.checklist, { label, done: false }],
    });
    newChecklist[feature.id] = '';
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function removeChecklistItem(feature: ProjectFeature, index: number) {
  const checklist = feature.checklist.filter((_, itemIndex) => itemIndex !== index);
  try {
    await api.updateFeature(feature.id, { checklist });
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function removeFeature(feature: ProjectFeature) {
  const confirmed = await confirmAction({
    title: t('projects.deleteFeatureTitle'),
    message: t('projects.deleteFeatureText', { title: feature.title }),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteFeature(feature.id);
    toast.success(t('projects.featureDeleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.projects')"
    :subtitle="$t('projects.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <button type="button" class="btn btn-primary" @click="openProjectCreate">
        <Icon name="plus" :size="16" /> {{ $t('projects.addProject') }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loading" class="stack">
    <div class="skeleton" style="height: 200px" />
    <div class="skeleton" style="height: 280px" />
  </div>

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.projectsLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <div v-else-if="projects.length === 0" class="card">
    <EmptyState
      :title="$t('projects.noProjectsTitle')"
      :text="$t('projects.noProjectsText')"
      icon="projects"
    >
      <button type="button" class="btn btn-primary btn-sm" @click="openProjectCreate">{{ $t('projects.addProject') }}</button>
    </EmptyState>
  </div>

  <div v-else class="stack">
    <div class="grid stats-grid">
      <div class="card compact">
        <div class="stat-label">{{ $t('planner.taskProject') }}</div>
        <div class="stat-value">{{ projects.length }}</div>
      </div>
      <div class="card compact">
        <div class="stat-label">{{ $t('projects.featureCount') }}</div>
        <div class="stat-value">{{ completedFeatures }}/{{ totalFeatures }}</div>
      </div>
      <div class="card compact">
        <div class="stat-label">{{ $t('projects.completedFeatures') }}</div>
        <div class="stat-value">{{ completedFeatures }}</div>
      </div>
      <div class="card compact">
        <div class="stat-label">{{ $t('projects.featureRate') }}</div>
        <div class="stat-value">{{ totalFeatures > 0 ? Math.round((completedFeatures / totalFeatures) * 100) : 0 }}%</div>
      </div>
    </div>

    <section v-for="project in projects" :key="project.id" class="card">
      <div class="card-head">
        <div class="grow">
          <div class="row wrap" style="gap: 6px; margin-bottom: 4px">
            <h2>{{ project.name }}</h2>
            <span class="badge badge-neutral">{{ projectStatusLabels[project.status] }}</span>
            <span v-if="project.isSeeded" class="badge badge-outline">{{ $t('common.seed') }}</span>
          </div>
          <p class="card-hint">{{ project.description }}</p>
          <div class="list-meta">
            <span v-if="project.startedAt">{{ $t('projects.started', { date: formatDate(project.startedAt) }) }}</span>
            <span v-if="project.targetDate">{{ $t('projects.target', { date: formatDate(project.targetDate) }) }}</span>
            <span v-if="project.completedAt" class="text-success">{{ $t('projects.completedAt', { date: formatDate(project.completedAt) }) }}</span>
          </div>
        </div>
        <div class="row" style="gap: 2px">
          <button type="button" class="btn btn-ghost btn-icon" :title="$t('projects.editProject')" @click="openProjectEdit(project)">
            <Icon name="edit" :size="15" />
          </button>
          <button type="button" class="btn btn-ghost btn-icon" :title="$t('projects.deleteProject')" @click="removeProject(project)">
            <Icon name="trash" :size="15" />
          </button>
        </div>
      </div>

      <div class="progress-meta">
        <span>{{ $t('projects.projectProgress', { done: project.features.filter((f) => f.status === 'completed').length, total: project.features.length }) }}</span>
        <strong>{{ projectProgress(project) }}%</strong>
      </div>
      <ProgressBar :value="projectProgress(project)" size="lg" />

      <div class="divider" />

      <div class="row-between" style="margin-bottom: 10px">
        <h3>{{ $t('projects.features') }}</h3>
        <button type="button" class="btn btn-sm" @click="openFeatureCreate(project.id)">
          <Icon name="plus" :size="14" /> {{ $t('projects.addFeature') }}
        </button>
      </div>

      <div v-if="project.features.length === 0">
        <EmptyState :title="$t('projects.noFeaturesTitle')" :text="$t('projects.noFeaturesText')" icon="projects" />
      </div>
      <div v-else>
        <article v-for="feature in project.features" :key="feature.id" class="feature-card">
          <div class="row-between wrap" style="gap: 10px">
            <div class="grow">
              <div class="row wrap" style="gap: 6px">
                <strong>{{ feature.title }}</strong>
                <span class="badge" :class="`badge-${badgeToneForPriority(feature.priority)}`">
                  {{ priorityLabels[feature.priority] }}
                </span>
                <span v-if="feature.targetDate" class="badge badge-neutral">
                  {{ formatDate(feature.targetDate) }}
                </span>
              </div>
              <p v-if="feature.description" class="card-hint">{{ feature.description }}</p>
            </div>
            <div class="row" style="gap: 6px">
              <select
                class="select input-sm"
                style="max-width: 150px"
                :value="feature.status"
                :aria-label="$t('projects.featureStatusAria', { title: feature.title })"
                @change="updateFeatureStatus(feature, $event)"
              >
                <option v-for="status in FEATURE_STATUSES" :key="status" :value="status">
                  {{ featureStatusLabels[status] }}
                </option>
              </select>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('projects.editFeature')" @click="openFeatureEdit(feature)">
                <Icon name="edit" :size="14" />
              </button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('projects.deleteFeature')" @click="removeFeature(feature)">
                <Icon name="trash" :size="14" />
              </button>
            </div>
          </div>

          <div class="progress-meta mt-8">
            <span>Checklist {{ feature.checklist.filter((item) => item.done).length }}/{{ feature.checklist.length }}</span>
            <span>{{ featureProgress(feature) }}%</span>
          </div>
          <ProgressBar :value="featureProgress(feature)" />

          <div class="feature-checklist">
            <div
              v-for="(item, index) in feature.checklist"
              :key="`${feature.id}-${index}`"
              class="check-item"
              :class="{ 'is-done': item.done }"
            >
              <input
                type="checkbox"
                :checked="item.done"
                :aria-label="$t('projects.checklistAria', { title: item.label })"
                @change="toggleChecklist(feature, index)"
              />
              <span class="check-label">{{ item.label }}</span>
              <div class="check-actions">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" :aria-label="$t('common.delete')" @click="removeChecklistItem(feature, index)">
                  <Icon name="trash" :size="13" />
                </button>
              </div>
            </div>
            <form class="row mt-8" style="gap: 6px" @submit.prevent="addChecklistItem(feature)">
              <input
                v-model="newChecklist[feature.id]"
                class="input input-sm"
                :placeholder="$t('projects.addChecklistPlaceholder')"
                :aria-label="$t('projects.addChecklistAria', { title: feature.title })"
              />
              <button type="submit" class="btn btn-sm" :disabled="!(newChecklist[feature.id] ?? '').trim()">
                {{ $t('common.add') }}
              </button>
            </form>
          </div>

          <p v-if="feature.notes" class="muted mt-8" style="white-space: pre-line">{{ feature.notes }}</p>
        </article>
      </div>
    </section>
  </div>

  <BaseModal v-if="showProjectModal" :title="editingProject ? $t('projects.editProject') : $t('projects.addProject')" @close="showProjectModal = false">
    <form id="project-form" class="stack" @submit.prevent="saveProject">
      <div class="field">
        <label class="field-label" for="project-name">{{ $t('projects.projectName') }}</label>
        <input id="project-name" v-model="projectForm.name" class="input" required />
      </div>
      <div class="field">
        <label class="field-label" for="project-description">{{ $t('course.descriptionField') }}</label>
        <textarea id="project-description" v-model="projectForm.description" class="textarea" />
      </div>
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="project-status">{{ $t('jobs.status') }}</label>
          <select id="project-status" v-model="projectForm.status" class="select">
            <option v-for="status in PROJECT_STATUSES" :key="status" :value="status">
              {{ projectStatusLabels[status] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="project-started">{{ $t('projects.projectStarted') }}</label>
          <input id="project-started" v-model="projectForm.startedDate" class="input" type="date" />
        </div>
        <div class="field">
          <label class="field-label" for="project-target">{{ $t('projects.projectTarget') }}</label>
          <input id="project-target" v-model="projectForm.targetDate" class="input" type="date" />
        </div>
      </div>
      <p class="field-hint">{{ $t('projects.projectStatusHint') }}</p>
      <p v-if="formError" class="form-error">{{ formError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" @click="showProjectModal = false">{{ $t('common.cancel') }}</button>
      <button type="submit" form="project-form" class="btn btn-primary" :disabled="busy">
        <span v-if="busy" class="spinner" /> {{ $t('projects.saveProject') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showFeatureModal"
    :title="editingFeature ? $t('projects.editFeature') : $t('projects.addFeature')"
    @close="showFeatureModal = false"
  >
    <form id="feature-form" class="stack" @submit.prevent="saveFeature">
      <div class="field">
        <label class="field-label" for="feature-title">{{ $t('projects.featureName') }}</label>
        <input id="feature-title" v-model="featureForm.title" class="input" required />
      </div>
      <div class="field">
        <label class="field-label" for="feature-description">{{ $t('course.descriptionField') }}</label>
        <textarea id="feature-description" v-model="featureForm.description" class="textarea" />
      </div>
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="feature-status">{{ $t('jobs.status') }}</label>
          <select id="feature-status" v-model="featureForm.status" class="select">
            <option v-for="status in FEATURE_STATUSES" :key="status" :value="status">
              {{ featureStatusLabels[status] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="feature-priority">{{ $t('planner.taskPriority') }}</label>
          <select id="feature-priority" v-model="featureForm.priority" class="select">
            <option v-for="priority in PRIORITIES" :key="priority" :value="priority">
              {{ priorityLabels[priority] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="feature-target">{{ $t('planner.taskPlanned') }}</label>
          <input id="feature-target" v-model="featureForm.targetDate" class="input" type="date" />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="feature-notes">{{ $t('jobs.notes') }}</label>
        <textarea id="feature-notes" v-model="featureForm.notes" class="textarea" />
      </div>
      <p class="field-hint">{{ $t('projects.featureChecklistHint') }}</p>
      <p v-if="formError" class="form-error">{{ formError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" @click="showFeatureModal = false">{{ $t('common.cancel') }}</button>
      <button type="submit" form="feature-form" class="btn btn-primary" :disabled="busy">
        <span v-if="busy" class="spinner" /> {{ $t('projects.saveFeature') }}
      </button>
    </template>
  </BaseModal>
</template>
