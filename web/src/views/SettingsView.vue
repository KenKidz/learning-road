<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AiStatus,
  AuthStatus,
  ExportPayload,
  ImportMode,
  ImportPreviewResult,
  ImportResult,
  UserSettings,
} from '@shared/types';
import { api, ApiError, downloadExport } from '../lib/api';
import { formatDateTime, todayInTimezone } from '../lib/format';
import { useToast } from '../composables/useToast';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseModal from '../components/BaseModal.vue';
import Icon from '../components/Icon.vue';

const toast = useToast();
const { t } = useI18n();

const settings = ref<UserSettings | null>(null);
const authStatus = ref<AuthStatus | null>(null);
const aiStatus = ref<AiStatus | null>(null);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const formError = ref('');
const exporting = ref(false);
const importing = ref(false);
const importedSummary = ref<ImportResult | null>(null);
const showImportModal = ref(false);
const pendingImportPayload = ref<ExportPayload | null>(null);
const importPreview = ref<ImportPreviewResult | null>(null);
const importMode = ref<ImportMode>('merge');

const weekDayOrder = [1, 2, 3, 4, 5, 6, 0];

const timezones = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

const proficiencyOptions = [
  { value: 'beginner', labelKey: 'settings.proficiencyBeginner' },
  { value: 'basic', labelKey: 'settings.proficiencyBasic' },
  { value: 'intermediate', labelKey: 'settings.proficiencyIntermediate' },
  { value: 'good', labelKey: 'settings.proficiencyGood' },
  { value: 'advanced', labelKey: 'settings.proficiencyAdvanced' },
];
const targetRoles = [
  { value: 'Frontend Developer (ReactJS)', labelKey: 'settings.roleReact' },
  { value: 'Frontend Developer (VueJS/Nuxt)', labelKey: 'settings.roleVue' },
  { value: 'ReactJS Developer', labelKey: 'settings.roleReactShort' },
  { value: 'Full-stack Developer (React/Node.js)', labelKey: 'settings.roleFullstack' },
  { value: 'AI-powered Web Developer', labelKey: 'settings.roleAi' },
];

const legacyProficiency: Record<string, string> = {
  'Mới bắt đầu': 'beginner',
  'Cơ bản': 'basic',
  Khá: 'intermediate',
  Tốt: 'good',
  'Thành thạo': 'advanced',
  Beginner: 'beginner',
  Basic: 'basic',
  Intermediate: 'intermediate',
  Good: 'good',
  Advanced: 'advanced',
};

function normalizeProficiency(value: string | null): string {
  return value ? legacyProficiency[value] ?? value : '';
}

const form = reactive({
  timezone: 'Asia/Ho_Chi_Minh',
  roadmapStartDate: '',
  dailyGoalMinutes: '60',
  weeklyGoalMinutes: '420',
  studyWindow: '19:00-21:00',
  preferredStudyDays: [] as number[],
  experienceYears: '',
  level: '',
  targetRole: '',
  backendLevel: '',
  typescriptLevel: '',
  sqlLevel: '',
  gitLevel: '',
});

const todayLabel = ref('');

function populate(data: UserSettings) {
  form.timezone = data.timezone;
  form.roadmapStartDate = data.roadmapStartDate ?? '';
  form.dailyGoalMinutes = String(data.dailyGoalMinutes);
  form.weeklyGoalMinutes = String(data.weeklyGoalMinutes);
  form.studyWindow = data.studyWindow;
  form.preferredStudyDays = [...data.preferredStudyDays];
  form.experienceYears = data.experienceYears === null ? '' : String(data.experienceYears);
  form.level = data.level ?? '';
  form.targetRole = data.targetRole ?? '';
  form.backendLevel = normalizeProficiency(data.backendLevel);
  form.typescriptLevel = normalizeProficiency(data.typescriptLevel);
  form.sqlLevel = normalizeProficiency(data.sqlLevel);
  form.gitLevel = normalizeProficiency(data.gitLevel);
  todayLabel.value = todayInTimezone(data.timezone);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [settingsResponse, authResponse, aiResponse] = await Promise.all([
      api.settings(),
      api.authStatus(),
      api.aiStatus(),
    ]);
    settings.value = settingsResponse;
    authStatus.value = authResponse;
    aiStatus.value = aiResponse;
    populate(settingsResponse);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('errors.settingsLoad');
  } finally {
    loading.value = false;
  }
}

function toggleStudyDay(day: number) {
  if (form.preferredStudyDays.includes(day)) {
    form.preferredStudyDays = form.preferredStudyDays.filter((item) => item !== day);
  } else {
    form.preferredStudyDays = [...form.preferredStudyDays, day].sort((a, b) => a - b);
  }
}

async function save() {
  formError.value = '';
  const daily = Number(form.dailyGoalMinutes);
  const weekly = Number(form.weeklyGoalMinutes);
  if (!Number.isFinite(daily) || daily < 0 || daily > 1440) {
    formError.value = t('settings.invalidDaily');
    return;
  }
  if (!Number.isFinite(weekly) || weekly < 0 || weekly > 10080) {
    formError.value = t('settings.invalidWeekly');
    return;
  }
  saving.value = true;
  try {
    const updated = await api.updateSettings({
      timezone: form.timezone.trim(),
      roadmapStartDate: form.roadmapStartDate || null,
      dailyGoalMinutes: daily,
      weeklyGoalMinutes: weekly,
      preferredStudyDays: form.preferredStudyDays,
      studyWindow: form.studyWindow.trim(),
      experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
      level: form.level || null,
      targetRole: form.targetRole || null,
      backendLevel: form.backendLevel || null,
      typescriptLevel: form.typescriptLevel || null,
      sqlLevel: form.sqlLevel || null,
      gitLevel: form.gitLevel || null,
    });
    settings.value = updated;
    populate(updated);
    toast.success(t('settings.saved'));
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : t('errors.unexpected');
  } finally {
    saving.value = false;
  }
}

async function exportData() {
  exporting.value = true;
  try {
    await downloadExport();
    toast.success(t('settings.exported'));
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('errors.unexpected'));
  } finally {
    exporting.value = false;
  }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text) as ExportPayload;
    if (payload.app !== 'learning-road' || payload.version !== 1) {
      toast.error(t('settings.invalidFile'));
      return;
    }
    importing.value = true;
    const preview = await api.previewImport(payload);
    pendingImportPayload.value = payload;
    importPreview.value = preview;
    importMode.value = 'merge';
    showImportModal.value = true;
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('settings.invalidImport'));
  } finally {
    importing.value = false;
    input.value = '';
  }
}

async function confirmImport() {
  if (!pendingImportPayload.value || importing.value) return;
  importing.value = true;
  try {
    const result = await api.importData(pendingImportPayload.value, importMode.value);
    importedSummary.value = result;
    showImportModal.value = false;
    pendingImportPayload.value = null;
    importPreview.value = null;
    toast.success(t('settings.imported'));
    await load();
    window.setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : t('settings.invalidImport'));
  } finally {
    importing.value = false;
  }
}

function closeImportModal() {
  if (importing.value) return;
  showImportModal.value = false;
  pendingImportPayload.value = null;
  importPreview.value = null;
}

onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('nav.settings')"
    :subtitle="$t('settings.subtitle')"
  >
    <template #actions>
      <button type="button" class="btn" :disabled="loading" @click="load">
        <Icon name="refresh" :size="16" /> {{ $t('common.refresh') }}
      </button>
      <button type="button" class="btn btn-primary" :disabled="saving || loading" @click="save">
        <span v-if="saving" class="spinner" /> {{ $t('settings.saveSettings') }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loading" class="stack">
    <div class="skeleton" style="height: 260px" />
    <div class="skeleton" style="height: 220px" />
  </div>

  <div v-else-if="error" class="card">
    <EmptyState :title="$t('errors.settingsLoad')" :text="error" icon="alert">
      <button type="button" class="btn btn-primary" @click="load">{{ $t('common.retry') }}</button>
    </EmptyState>
  </div>

  <div v-else-if="settings" class="stack">
    <div class="alert alert-info">
      <Icon name="info" :size="18" />
      <div class="alert-body">
        <strong>{{ $t('settings.originalScheduleTitle') }}</strong>
        {{ $t('settings.originalScheduleText', { date: todayLabel }) }}
      </div>
    </div>

    <form class="stack" @submit.prevent="save">
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('settings.scheduleTitle') }}</h2>
            <p class="card-hint">
              {{ $t('settings.scheduleHint') }}
            </p>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="settings-start">{{ $t('settings.startDate') }}</label>
            <input id="settings-start" v-model="form.roadmapStartDate" class="input" type="date" />
            <span class="field-hint">{{ $t('settings.startDateHint') }}</span>
          </div>
          <div class="field">
            <label class="field-label" for="settings-timezone">{{ $t('settings.timezone') }}</label>
            <input id="settings-timezone" v-model="form.timezone" class="input" list="timezone-list" required />
            <datalist id="timezone-list">
              <option v-for="zone in timezones" :key="zone" :value="zone" />
            </datalist>
          </div>
          <div class="field">
            <label class="field-label" for="settings-daily">{{ $t('settings.dailyGoal') }}</label>
            <input
              id="settings-daily"
              v-model="form.dailyGoalMinutes"
              class="input"
              type="number"
              min="0"
              max="1440"
            />
          </div>
          <div class="field">
            <label class="field-label" for="settings-weekly">{{ $t('settings.weeklyGoal') }}</label>
            <input
              id="settings-weekly"
              v-model="form.weeklyGoalMinutes"
              class="input"
              type="number"
              min="0"
              max="10080"
            />
          </div>
          <div class="field span-2">
            <label class="field-label" for="settings-window">{{ $t('settings.studyWindow') }}</label>
            <input id="settings-window" v-model="form.studyWindow" class="input" placeholder="19:00-21:00" />
          </div>
          <div class="field span-2">
            <span class="field-label">{{ $t('settings.studyDays') }}</span>
            <div class="pill-group" role="group" :aria-label="$t('settings.studyDays')">
              <button
                v-for="day in weekDayOrder"
                :key="day"
                type="button"
                class="pill-btn"
                :class="{ active: form.preferredStudyDays.includes(day) }"
                :aria-pressed="form.preferredStudyDays.includes(day)"
                @click="toggleStudyDay(day)"
              >
                <Icon v-if="form.preferredStudyDays.includes(day)" name="check" :size="13" />
                {{ $t(`weekdays.d${day}`) }}
              </button>
            </div>
            <span class="field-hint">{{ $t('settings.studyDaysCount', { count: form.preferredStudyDays.length }) }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('settings.profileTitle') }}</h2>
            <p class="card-hint">{{ $t('settings.profileHint') }}</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="settings-experience">{{ $t('settings.experience') }}</label>
            <input
              id="settings-experience"
              v-model="form.experienceYears"
              class="input"
              type="number"
              min="0"
              max="60"
              :placeholder="$t('common.notSet')"
            />
          </div>
          <div class="field">
            <label class="field-label" for="settings-level">{{ $t('settings.level') }}</label>
            <select id="settings-level" v-model="form.level" class="select">
              <option value="">{{ $t('common.notSet') }}</option>
              <option value="Junior">{{ $t('settings.levelJunior') }}</option>
              <option value="Middle">{{ $t('settings.levelMiddle') }}</option>
              <option value="Senior">{{ $t('settings.levelSenior') }}</option>
            </select>
          </div>
          <div class="field span-2">
            <label class="field-label" for="settings-role">{{ $t('settings.targetRole') }}</label>
            <select id="settings-role" v-model="form.targetRole" class="select">
              <option value="">{{ $t('common.notSet') }}</option>
              <option v-for="role in targetRoles" :key="role.value" :value="role.value">
                {{ $t(role.labelKey) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="settings-backend">{{ $t('settings.backend') }}</label>
            <select id="settings-backend" v-model="form.backendLevel" class="select">
              <option value="">{{ $t('common.notSet') }}</option>
              <option v-for="option in proficiencyOptions" :key="option.value" :value="option.value">
                {{ $t(option.labelKey) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="settings-ts">{{ $t('settings.typescript') }}</label>
            <select id="settings-ts" v-model="form.typescriptLevel" class="select">
              <option value="">{{ $t('common.notSet') }}</option>
              <option v-for="option in proficiencyOptions" :key="option.value" :value="option.value">
                {{ $t(option.labelKey) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="settings-sql">{{ $t('settings.sql') }}</label>
            <select id="settings-sql" v-model="form.sqlLevel" class="select">
              <option value="">{{ $t('common.notSet') }}</option>
              <option v-for="option in proficiencyOptions" :key="option.value" :value="option.value">
                {{ $t(option.labelKey) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="settings-git">{{ $t('settings.git') }}</label>
            <select id="settings-git" v-model="form.gitLevel" class="select">
              <option value="">{{ $t('common.notSet') }}</option>
              <option v-for="option in proficiencyOptions" :key="option.value" :value="option.value">
                {{ $t(option.labelKey) }}
              </option>
            </select>
          </div>
        </div>
        <p v-if="formError" class="form-error mt-16">{{ formError }}</p>
        <div class="row mt-16" style="justify-content: flex-end">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner" /> {{ $t('settings.saveSettings') }}
          </button>
        </div>
      </section>
    </form>

    <div class="grid cols-2">
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('settings.dataTitle') }}</h2>
            <p class="card-hint">
              {{ $t('settings.dataHint') }}
            </p>
          </div>
        </div>
        <div class="row wrap" style="gap: 10px">
          <button type="button" class="btn" :disabled="exporting" @click="exportData">
            <span v-if="exporting" class="spinner" />
            <Icon v-else name="download" :size="16" />
            {{ $t('settings.export') }}
          </button>
          <label class="btn" :class="{ disabled: importing }">
            <span v-if="importing" class="spinner" />
            <Icon v-else name="upload" :size="16" />
            {{ $t('settings.import') }}
            <input
              type="file"
              accept="application/json,.json"
              class="visually-hidden"
              :disabled="importing"
              @change="importFile"
            />
          </label>
        </div>
        <p class="field-hint mt-12">
          {{ $t('settings.dataWarning') }}
        </p>
        <div v-if="importedSummary" class="alert alert-info mt-16">
          <Icon name="check" :size="18" />
          <div class="alert-body">
            {{
              $t('settings.importedSummary', {
                courses: importedSummary.imported.courses,
                tasks: importedSummary.imported.tasks,
                sessions: importedSummary.imported.studySessions,
                jobs: importedSummary.imported.jobApplications,
                notes: importedSummary.imported.learningNotes,
              })
            }}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ $t('settings.securityTitle') }}</h2>
            <p class="card-hint">{{ $t('settings.securityHint') }}</p>
          </div>
        </div>
        <ul class="stack-sm">
          <li class="row-between">
            <span class="muted">{{ $t('settings.passwordProtection') }}</span>
            <span class="badge" :class="authStatus?.required ? 'badge-success' : 'badge-warning'">
              {{ authStatus?.required ? $t('settings.authOn') : $t('settings.authOff') }}
            </span>
          </li>
          <li class="row-between">
            <span class="muted">{{ $t('ai.statusTitle') }}</span>
            <span class="badge" :class="aiStatus?.enabled ? 'badge-success' : 'badge-neutral'">
              {{
                aiStatus?.enabled
                  ? $t('ai.statusConnected', { model: aiStatus.model })
                  : $t('ai.statusDisabled')
              }}
            </span>
          </li>
          <li v-if="aiStatus" class="row-between">
            <span class="muted">{{ $t('ai.baseUrlLabel') }}</span>
            <span class="mono">{{ aiStatus.baseUrl }}</span>
          </li>
          <li class="row-between">
            <span class="muted">{{ $t('settings.seedData') }}</span>
            <span>{{ $t('settings.seedValue') }}</span>
          </li>
          <li class="row-between">
            <span class="muted">{{ $t('settings.progressData') }}</span>
            <span>{{ $t('settings.progressValue') }}</span>
          </li>
          <li class="row-between">
            <span class="muted">{{ $t('settings.todaySetting') }}</span>
            <span class="tabular">{{ todayLabel }}</span>
          </li>
        </ul>
        <p class="field-hint mt-12">
          {{ $t('settings.securityNote') }}
        </p>
        <p class="field-hint mt-8">
          {{ $t('ai.envGuide') }}
        </p>
      </section>
    </div>

    <section class="card">
      <h2 class="card-title">{{ $t('settings.opsTitle') }}</h2>
      <ul class="stack-sm mt-12">
        <li class="muted">{{ $t('settings.opsSeed') }}</li>
        <li class="muted">{{ $t('settings.opsSessions') }}</li>
        <li class="muted">{{ $t('settings.opsWeight') }}</li>
        <li class="muted">{{ $t('settings.opsOverdue') }}</li>
      </ul>
    </section>
  </div>

  <BaseModal
    v-if="showImportModal && importPreview"
    :title="$t('settings.previewTitle')"
    wide
    @close="closeImportModal"
  >
    <div class="stack">
      <p class="card-hint">
        {{ $t('settings.previewExportedAt', { date: formatDateTime(importPreview.exportedAt) }) }}
      </p>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('settings.previewColEntity') }}</th>
              <th class="tabular">{{ $t('settings.previewColCurrent') }}</th>
              <th class="tabular">{{ $t('settings.previewColIncoming') }}</th>
              <th class="tabular">{{ $t('settings.previewColMergeAdd') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in [
                { key: 'courses', label: $t('palette.groupCourses') },
                { key: 'tasks', label: $t('palette.groupTasks') },
                { key: 'studySessions', label: $t('planner.historySessions') },
                { key: 'projects', label: $t('planner.taskProject') },
                { key: 'interviewTopics', label: $t('palette.groupTopics') },
                { key: 'interviewChecklist', label: $t('interview.checklist') },
                { key: 'jobApplications', label: $t('palette.groupJobs') },
                { key: 'learningNotes', label: $t('palette.groupNotes') },
              ] as const"
              :key="row.key"
            >
              <td>{{ row.label }}</td>
              <td class="tabular">{{ importPreview.existing[row.key] }}</td>
              <td class="tabular">{{ importPreview.merge[row.key].incoming }}</td>
              <td class="tabular">
                <span class="badge" :class="importPreview.merge[row.key].toAdd > 0 ? 'badge-info' : 'badge-neutral'">
                  +{{ importPreview.merge[row.key].toAdd }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="stack-sm">
        <div class="field-label">{{ $t('settings.importModeLabel') }}</div>
        <div class="pill-group">
          <button
            type="button"
            class="pill-btn"
            :class="{ active: importMode === 'merge' }"
            @click="importMode = 'merge'"
          >
            {{ $t('settings.importModeMerge') }}
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ active: importMode === 'replace' }"
            @click="importMode = 'replace'"
          >
            {{ $t('settings.importModeReplace') }}
          </button>
        </div>
        <p v-if="importMode === 'merge'" class="field-hint">
          {{ $t('settings.importModeMergeHint') }}
        </p>
        <p v-else class="form-error">
          {{ $t('settings.importConfirmText') }}
        </p>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn" :disabled="importing" @click="closeImportModal">
        {{ $t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn"
        :class="importMode === 'replace' ? 'btn-danger' : 'btn-primary'"
        :disabled="importing"
        @click="confirmImport"
      >
        <span v-if="importing" class="spinner" />
        {{ importMode === 'merge' ? $t('settings.importMergeConfirm') : $t('settings.importConfirm') }}
      </button>
    </template>
  </BaseModal>
</template>
