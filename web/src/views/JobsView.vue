<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { JobApplication, JobStatus, UserSettings } from '@shared/types';
import { JOB_STATUSES } from '@shared/types';
import { api, ApiError } from '../lib/api';
import { formatDate, todayInTimezone } from '../lib/format';
import { badgeToneForJobStatus, jobStatusLabels } from '../lib/labels';
import { useToast } from '../composables/useToast';
import { confirmAction } from '../composables/useConfirm';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import KanbanBoard, { type KanbanColumn } from '../components/KanbanBoard.vue';
import Icon from '../components/Icon.vue';

const toast = useToast();
const { t } = useI18n();

const applications = ref<JobApplication[]>([]);
const summary = ref<Record<JobStatus, number>>({
  saved: 0,
  applied: 0,
  interviewing: 0,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
});
const settings = ref<UserSettings | null>(null);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const formError = ref('');
const statusFilter = ref<JobStatus | 'all'>('all');
const search = ref('');
const viewMode = ref<'table' | 'board'>(
  typeof window !== 'undefined' && window.localStorage.getItem('lr-jobs-view') === 'board'
    ? 'board'
    : 'table',
);
const showModal = ref(false);
const editing = ref<JobApplication | null>(null);

function setViewMode(mode: 'table' | 'board') {
  viewMode.value = mode;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('lr-jobs-view', mode);
  }
}

const jobColumns = computed<KanbanColumn[]>(() =>
  JOB_STATUSES.map((status) => ({
    key: status,
    label: jobStatusLabels[status],
    tone: badgeToneForJobStatus(status),
  })),
);

const form = reactive({
  company: '',
  position: '',
  jobUrl: '',
  appliedAt: '',
  status: 'saved' as JobStatus,
  contactPerson: '',
  followUpAt: '',
  cvVersion: '',
  notes: '',
});

const today = computed(() =>
  settings.value ? todayInTimezone(settings.value.timezone) : new Date().toISOString().slice(0, 10),
);

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return applications.value.filter((application) => {
    if (statusFilter.value !== 'all' && application.status !== statusFilter.value) return false;
    if (query) {
      const haystack = `${application.company} ${application.position} ${application.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
});

const followUps = computed(() =>
  applications.value
    .filter(
      (application) =>
        application.followUpAt !== null &&
        application.followUpAt <= today.value &&
        application.status !== 'offer' &&
        application.status !== 'rejected' &&
        application.status !== 'withdrawn',
    )
    .sort((a, b) => (a.followUpAt ?? '').localeCompare(b.followUpAt ?? '')),
);

const totalCounts = computed(() =>
  JOB_STATUSES.reduce((total, status) => total + summary.value[status], 0),
);

async function load() {
  if (applications.value.length === 0 && !settings.value) {
    loading.value = true;
  }
  error.value = '';
  try {
    const [jobsResponse, settingsResponse] = await Promise.all([api.jobs(), api.settings()]);
    applications.value = jobsResponse.applications;
    summary.value = jobsResponse.summary;
    settings.value = settingsResponse;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.jobsLoad');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.company = '';
  form.position = '';
  form.jobUrl = '';
  form.appliedAt = today.value;
  form.status = 'applied';
  form.contactPerson = '';
  form.followUpAt = '';
  form.cvVersion = '';
  form.notes = '';
  formError.value = '';
  showModal.value = true;
}

function openEdit(application: JobApplication) {
  editing.value = application;
  form.company = application.company;
  form.position = application.position;
  form.jobUrl = application.jobUrl ?? '';
  form.appliedAt = application.appliedAt ?? '';
  form.status = application.status;
  form.contactPerson = application.contactPerson ?? '';
  form.followUpAt = application.followUpAt ?? '';
  form.cvVersion = application.cvVersion ?? '';
  form.notes = application.notes;
  formError.value = '';
  showModal.value = true;
}

async function save() {
  if (!form.company.trim() || !form.position.trim()) {
    formError.value = t('jobs.required');
    return;
  }
  busy.value = true;
  formError.value = '';
  try {
    const payload = {
      company: form.company.trim(),
      position: form.position.trim(),
      jobUrl: form.jobUrl.trim() || null,
      appliedAt: form.appliedAt || null,
      status: form.status,
      contactPerson: form.contactPerson.trim() || null,
      followUpAt: form.followUpAt || null,
      cvVersion: form.cvVersion.trim() || null,
      notes: form.notes.trim(),
    };
    if (editing.value) {
      await api.updateJob(editing.value.id, payload);
      toast.success(t('jobs.saved'));
    } else {
      await api.createJob(payload);
      toast.success(t('jobs.created'));
    }
    showModal.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    busy.value = false;
  }
}

async function changeStatus(application: JobApplication, event: Event) {
  const status = (event.target as HTMLSelectElement).value as JobStatus;
  if (status === application.status) return;
  await moveJob({ item: application, toColumn: status });
}

async function moveJob(payload: { item: JobApplication; toColumn: string }) {
  const status = payload.toColumn as JobStatus;
  const previous = payload.item.status;
  if (status === previous) return;
  payload.item.status = status;
  summary.value[previous] = Math.max(0, summary.value[previous] - 1);
  summary.value[status] += 1;
  try {
    await api.updateJob(payload.item.id, { status });
    toast.success(t('jobs.statusUpdated', { status: jobStatusLabels[status] }));
    await load();
  } catch (err) {
    payload.item.status = previous;
    summary.value[status] = Math.max(0, summary.value[status] - 1);
    summary.value[previous] += 1;
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function completeFollowUp(application: JobApplication) {
  try {
    await api.updateJob(application.id, { followUpAt: null });
    toast.success(t('jobs.followUpCompleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

async function remove(application: JobApplication) {
  const confirmed = await confirmAction({
    title: t('jobs.deleteTitle'),
    message: t('jobs.deleteText', { company: application.company, position: application.position }),
    confirmLabel: t('jobs.delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.deleteJob(application.id);
    toast.success(t('jobs.deleted'));
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  }
}

function toggleFilter(status: JobStatus) {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
}

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.jobs')"
    :subtitle="$t('jobs.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <button type="button" class="btn btn-primary" @click="openCreate">
        <Icon name="plus" :size="16" /> {{ $t('jobs.addApplication') }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loading" class="stack">
    <div class="skeleton skeleton-card" />
    <div class="skeleton" style="height: 260px" />
  </div>

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.jobsLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <template v-else>
    <div class="funnel">
      <button
        v-for="status in JOB_STATUSES"
        :key="status"
        type="button"
        class="funnel-item"
        :class="[`tone-${badgeToneForJobStatus(status)}`, { active: statusFilter === status }]"
        @click="toggleFilter(status)"
      >
        <div class="funnel-value tabular">{{ summary[status] }}</div>
        <div class="funnel-label">{{ jobStatusLabels[status] }}</div>
      </button>
    </div>
    <div class="row-between mt-8">
      <span class="muted tabular">{{ $t('jobs.totalCount', { count: totalCounts, followUps: followUps.length }) }}</span>
      <button v-if="statusFilter !== 'all'" type="button" class="link-btn" @click="statusFilter = 'all'">
        {{ $t('jobs.clearFilter', { status: jobStatusLabels[statusFilter] }) }}
      </button>
    </div>

    <div v-if="followUps.length > 0" class="card compact mt-16">
      <div class="card-head">
        <div>
          <h2 class="card-title">{{ $t('jobs.followUpTitle') }}</h2>
          <p class="card-hint">{{ $t('jobs.followUpHint') }}</p>
        </div>
        <span class="badge badge-warning tabular">{{ followUps.length }}</span>
      </div>
      <ul class="list">
        <li v-for="application in followUps" :key="application.id" class="list-item">
          <div class="grow">
            <div class="row-between">
              <strong>{{ application.company }} — {{ application.position }}</strong>
              <button type="button" class="btn btn-sm" @click="completeFollowUp(application)">
                <Icon name="check" :size="14" /> {{ $t('jobs.followUpDone') }}
              </button>
            </div>
            <div class="list-meta">
              <span class="text-danger tabular">{{ $t('jobs.followUpDate', { date: formatDate(application.followUpAt) }) }}</span>
              <span v-if="application.contactPerson" class="sep">·</span>
              <span v-if="application.contactPerson">{{ application.contactPerson }}</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <section class="card mt-16">
      <div class="card-head wrap">
        <div>
          <h2 class="card-title">{{ $t('jobs.applicationsTitle') }}</h2>
          <p class="card-hint">
            {{ $t('jobs.applicationsHint') }}
          </p>
        </div>
        <div class="row wrap" style="gap: 10px">
          <div class="input-wrap" style="max-width: 240px">
            <Icon name="search" :size="15" class="input-icon-left" />
            <input
              v-model="search"
              class="input input-sm input-has-left"
              :class="{ 'input-has-right': search }"
              type="search"
              :placeholder="$t('jobs.searchPlaceholder')"
              :aria-label="$t('jobs.searchPlaceholder')"
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
          <span class="badge badge-neutral tabular">{{ $t('jobs.showing', { count: filtered.length }) }}</span>
          <div class="tabs">
            <button
              type="button"
              class="tab"
              :class="{ active: viewMode === 'table' }"
              @click="setViewMode('table')"
            >
              <Icon name="table" :size="13" /> {{ $t('jobs.viewTable') }}
            </button>
            <button
              type="button"
              class="tab"
              :class="{ active: viewMode === 'board' }"
              @click="setViewMode('board')"
            >
              <Icon name="board" :size="13" /> {{ $t('jobs.viewBoard') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="filtered.length === 0">
        <EmptyState
          :title="$t('jobs.noApplicationsTitle')"
          :text="$t('jobs.noApplicationsText')"
          icon="jobs"
        >
          <div class="row wrap" style="gap: 8px; justify-content: center">
            <button
              v-if="statusFilter !== 'all' || search"
              type="button"
              class="btn btn-sm"
              @click="
                statusFilter = 'all';
                search = '';
              "
            >
              {{ $t('common.clear') }}
            </button>
            <button type="button" class="btn btn-primary btn-sm" @click="openCreate">{{ $t('jobs.addApplication') }}</button>
          </div>
        </EmptyState>
      </div>

      <div v-else-if="viewMode === 'board'">
        <KanbanBoard
          :columns="jobColumns"
          :items="filtered"
          :get-column="(item) => item.status"
          @move="moveJob"
        >
          <template #card="{ item, columns, moveTo }">
            <div class="stack-sm" style="gap: 6px">
              <div class="row-between" style="gap: 6px; align-items: flex-start">
                <div class="grow" style="min-width: 0">
                  <div class="cell-main">{{ item.company }}</div>
                  <div class="cell-sub">{{ item.position }}</div>
                </div>
                <div class="row" style="gap: 2px">
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-sm"
                    :title="$t('jobs.edit')"
                    @click="openEdit(item)"
                  >
                    <Icon name="edit" :size="13" />
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-sm btn-danger-hover"
                    :title="$t('jobs.delete')"
                    @click="remove(item)"
                  >
                    <Icon name="trash" :size="13" />
                  </button>
                </div>
              </div>

              <div class="list-meta">
                <span v-if="item.appliedAt" class="tabular">{{ formatDate(item.appliedAt) }}</span>
                <span
                  v-if="item.followUpAt"
                  class="tabular"
                  :class="{ 'text-danger': item.followUpAt <= today }"
                >
                  {{ $t('jobs.followUpDate', { date: formatDate(item.followUpAt) }) }}
                </span>
              </div>

              <select
                class="select input-sm"
                :value="item.status"
                :aria-label="$t('jobs.statusAria', { company: item.company })"
                @change="moveTo(item, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="col in columns" :key="col.key" :value="col.key">
                  {{ col.label }}
                </option>
              </select>
            </div>
          </template>
        </KanbanBoard>
      </div>

      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('jobs.companyPosition') }}</th>
              <th>{{ $t('jobs.status') }}</th>
              <th>{{ $t('jobs.applied') }}</th>
              <th>{{ $t('jobs.followUp') }}</th>
              <th>{{ $t('jobs.contactCv') }}</th>
              <th :aria-label="$t('jobs.actions')">{{ $t('jobs.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="application in filtered" :key="application.id">
              <td>
                <div class="cell-main">{{ application.company }}</div>
                <div class="cell-sub">{{ application.position }}</div>
                <a
                  v-if="application.jobUrl"
                  :href="application.jobUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="cell-link"
                >
                  <Icon name="external" :size="12" /> {{ $t('jobs.jobUrl') }}
                </a>
                <div v-if="application.notes" class="cell-sub" style="max-width: 320px">
                  {{ application.notes }}
                </div>
              </td>
              <td>
                <div class="stack-sm" style="gap: 6px; align-items: flex-start">
                  <span class="badge" :class="`badge-${badgeToneForJobStatus(application.status)}`">
                    {{ jobStatusLabels[application.status] }}
                  </span>
                  <select
                    class="select input-sm"
                    style="max-width: 145px"
                    :value="application.status"
                    :aria-label="$t('jobs.statusAria', { company: application.company })"
                    @change="changeStatus(application, $event)"
                  >
                    <option v-for="status in JOB_STATUSES" :key="status" :value="status">
                      {{ jobStatusLabels[status] }}
                    </option>
                  </select>
                </div>
              </td>
              <td class="nowrap tabular">{{ formatDate(application.appliedAt) }}</td>
              <td class="nowrap tabular">
                <span v-if="application.followUpAt" :class="{ 'text-danger': application.followUpAt <= today }">
                  {{ formatDate(application.followUpAt) }}
                </span>
                <span v-else class="muted">{{ $t('jobs.noContact') }}</span>
              </td>
              <td>
                <div>{{ application.contactPerson ?? '—' }}</div>
                <div class="cell-sub">{{ application.cvVersion ? $t('jobs.cv', { version: application.cvVersion }) : $t('jobs.noCv') }}</div>
              </td>
              <td>
                <div class="row" style="gap: 2px">
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" :title="$t('jobs.edit')" @click="openEdit(application)">
                    <Icon name="edit" :size="14" />
                  </button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-hover" :title="$t('jobs.delete')" @click="remove(application)">
                    <Icon name="trash" :size="14" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </template>

  <BaseModal v-if="showModal" :title="editing ? $t('jobs.editTitle') : $t('jobs.createTitle')" wide @close="showModal = false">
    <form id="job-form" class="stack" @submit.prevent="save">
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="job-company">{{ $t('jobs.company') }}</label>
          <input id="job-company" v-model="form.company" class="input" required />
        </div>
        <div class="field">
          <label class="field-label" for="job-position">{{ $t('jobs.position') }}</label>
          <input id="job-position" v-model="form.position" class="input" required />
        </div>
        <div class="field span-2">
          <label class="field-label" for="job-url">{{ $t('jobs.jobUrlField') }}</label>
          <input id="job-url" v-model="form.jobUrl" class="input" placeholder="https://…" />
        </div>
        <div class="field">
          <label class="field-label" for="job-status">{{ $t('jobs.status') }}</label>
          <select id="job-status" v-model="form.status" class="select">
            <option v-for="status in JOB_STATUSES" :key="status" :value="status">
              {{ jobStatusLabels[status] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="job-applied">{{ $t('jobs.appliedDate') }}</label>
          <input id="job-applied" v-model="form.appliedAt" class="input" type="date" />
        </div>
        <div class="field">
          <label class="field-label" for="job-followup">{{ $t('jobs.followUpDateField') }}</label>
          <input id="job-followup" v-model="form.followUpAt" class="input" type="date" />
        </div>
        <div class="field">
          <label class="field-label" for="job-contact">{{ $t('jobs.contactField') }}</label>
          <input id="job-contact" v-model="form.contactPerson" class="input" />
        </div>
        <div class="field">
          <label class="field-label" for="job-cv">{{ $t('jobs.cvField') }}</label>
          <input id="job-cv" v-model="form.cvVersion" class="input" :placeholder="$t('jobs.cvPlaceholder')" />
        </div>
        <div class="field span-2">
          <label class="field-label" for="job-notes">{{ $t('jobs.notes') }}</label>
          <textarea id="job-notes" v-model="form.notes" class="textarea" />
        </div>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" @click="showModal = false">{{ $t('common.cancel') }}</button>
      <button type="submit" form="job-form" class="btn btn-primary" :disabled="busy">
        <span v-if="busy" class="spinner" /> {{ $t('jobs.save') }}
      </button>
    </template>
  </BaseModal>
</template>
