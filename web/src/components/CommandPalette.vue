<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { SearchResponse } from '@shared/types';
import { api } from '../lib/api';
import { useTheme } from '../composables/useTheme';
import { useFocusTimer } from '../composables/useFocusTimer';
import { setLocale } from '../i18n';
import Icon from './Icon.vue';

interface PaletteEntry {
  key: string;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: string;
  group: string;
  run: () => void;
}

const router = useRouter();
const { t, locale } = useI18n();
const { toggle: toggleTheme } = useTheme();
const focusTimer = useFocusTimer();

const open = ref(false);
const query = ref('');
const loading = ref(false);
const results = ref<SearchResponse | null>(null);
const activeIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: number | null = null;
let requestCounter = 0;

function close() {
  open.value = false;
}

async function openPalette() {
  open.value = true;
  query.value = '';
  results.value = null;
  activeIndex.value = 0;
  await nextTick();
  inputEl.value?.focus();
}

function navigate(path: string) {
  close();
  void router.push(path);
}

const quickActions = computed<PaletteEntry[]>(() => [
  {
    key: 'act-focus',
    title: t('palette.actionFocusToggle'),
    icon: 'timer',
    group: t('palette.quickActions'),
    run: () => {
      close();
      focusTimer.togglePlayPause();
    },
  },
  {
    key: 'act-session',
    title: t('palette.actionLogSession'),
    icon: 'clock',
    group: t('palette.quickActions'),
    run: () => navigate('/planner?action=session'),
  },
  {
    key: 'act-note',
    title: t('palette.actionNewNote'),
    icon: 'notes',
    group: t('palette.quickActions'),
    run: () => navigate('/notes?relatedType=general'),
  },
  {
    key: 'act-theme',
    title: t('palette.actionTheme'),
    icon: 'moon',
    group: t('palette.quickActions'),
    run: () => {
      toggleTheme();
      close();
    },
  },
  {
    key: 'act-locale',
    title: t('palette.actionLocale'),
    icon: 'sparkles',
    group: t('palette.quickActions'),
    run: () => {
      setLocale(locale.value === 'vi' ? 'en' : 'vi');
      close();
    },
  },
  {
    key: 'nav-dashboard',
    title: t('nav.dashboard'),
    icon: 'dashboard',
    group: t('nav.study'),
    run: () => navigate('/'),
  },
  {
    key: 'nav-roadmap',
    title: t('nav.roadmap'),
    icon: 'roadmap',
    group: t('nav.study'),
    run: () => navigate('/roadmap'),
  },
  {
    key: 'nav-planner',
    title: t('nav.planner'),
    icon: 'planner',
    group: t('nav.study'),
    run: () => navigate('/planner'),
  },
  {
    key: 'nav-projects',
    title: t('nav.projects'),
    icon: 'projects',
    group: t('nav.career'),
    run: () => navigate('/projects'),
  },
  {
    key: 'nav-interview',
    title: t('nav.interview'),
    icon: 'interview',
    group: t('nav.career'),
    run: () => navigate('/interview'),
  },
  {
    key: 'nav-jobs',
    title: t('nav.jobs'),
    icon: 'jobs',
    group: t('nav.career'),
    run: () => navigate('/jobs'),
  },
  {
    key: 'nav-notes',
    title: t('nav.notes'),
    icon: 'notes',
    group: t('nav.study'),
    run: () => navigate('/notes'),
  },
  {
    key: 'nav-settings',
    title: t('nav.settings'),
    icon: 'settings',
    group: t('nav.system'),
    run: () => navigate('/settings'),
  },
]);

const entries = computed<PaletteEntry[]>(() => {
  const trimmed = query.value.trim().toLowerCase();
  if (!trimmed) return quickActions.value;

  const list: PaletteEntry[] = [];
  const data = results.value;
  if (data) {
    const pushItems = (
      items: SearchResponse['courses'],
      group: string,
      icon: string,
      prefix: string,
    ) => {
      for (const item of items) {
        list.push({
          key: `${prefix}-${item.id}-${item.title}`,
          title: item.title,
          subtitle: item.subtitle,
          badge: item.badge,
          icon,
          group,
          run: () => navigate(item.route),
        });
      }
    };

    pushItems(data.courses, t('palette.groupCourses'), 'roadmap', 'course');
    pushItems(data.tasks, t('palette.groupTasks'), 'planner', 'task');
    pushItems(data.notes, t('palette.groupNotes'), 'notes', 'note');
    pushItems(data.projects, t('palette.groupProjects'), 'projects', 'proj');
    pushItems(data.interviewTopics, t('palette.groupTopics'), 'interview', 'topic');
    pushItems(data.interviewQuestions, t('palette.groupQuestions'), 'book', 'q');
    pushItems(data.jobs, t('palette.groupJobs'), 'jobs', 'job');
  }

  for (const act of quickActions.value) {
    if (act.title.toLowerCase().includes(trimmed)) {
      list.push(act);
    }
  }
  return list;
});

const groupedEntries = computed(() => {
  const groups: { group: string; items: { entry: PaletteEntry; index: number }[] }[] = [];
  const map = new Map<string, { entry: PaletteEntry; index: number }[]>();
  entries.value.forEach((entry, index) => {
    let bucket = map.get(entry.group);
    if (!bucket) {
      bucket = [];
      map.set(entry.group, bucket);
      groups.push({ group: entry.group, items: bucket });
    }
    bucket.push({ entry, index });
  });
  return groups;
});

watch(query, (next) => {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const trimmed = next.trim();
  activeIndex.value = 0;
  if (!trimmed) {
    results.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  const seq = ++requestCounter;
  debounceTimer = window.setTimeout(async () => {
    try {
      const res = await api.search(trimmed, 5);
      if (seq === requestCounter) {
        results.value = res;
      }
    } catch {
      if (seq === requestCounter) {
        results.value = null;
      }
    } finally {
      if (seq === requestCounter) {
        loading.value = false;
      }
    }
  }, 180);
});

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (open.value) close();
    else void openPalette();
    return;
  }
  if (!open.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (entries.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % entries.value.length;
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (entries.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + entries.value.length) % entries.value.length;
    }
  } else if (event.key === 'Enter') {
    const selected = entries.value[activeIndex.value];
    if (selected) {
      event.preventDefault();
      selected.run();
    }
  }
}

function handleOpenEvent() {
  void openPalette();
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('lr:open-command-palette', handleOpenEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('lr:open-command-palette', handleOpenEvent);
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay palette-overlay" @mousedown.self="close">
      <div
        class="palette-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('palette.aria')"
      >
        <div class="palette-input-row">
          <Icon name="search" :size="17" class="muted" />
          <input
            ref="inputEl"
            v-model="query"
            class="palette-input"
            type="search"
            :placeholder="$t('palette.placeholder')"
            :aria-label="$t('palette.placeholder')"
          />
          <span v-if="loading" class="spinner" />
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :aria-label="$t('common.close')"
            @click="close"
          >
            <Icon name="close" :size="15" />
          </button>
        </div>

        <div class="palette-results">
          <div v-if="!loading && entries.length === 0" class="palette-empty">
            {{ $t('palette.noResults') }}
          </div>
          <div v-for="section in groupedEntries" :key="section.group" class="palette-group">
            <div class="palette-group-title">{{ section.group }}</div>
            <button
              v-for="row in section.items"
              :key="row.entry.key"
              type="button"
              class="palette-item"
              :class="{ active: row.index === activeIndex }"
              @mouseenter="activeIndex = row.index"
              @click="row.entry.run()"
            >
              <Icon :name="row.entry.icon" :size="15" class="palette-item-icon" />
              <div class="grow" style="min-width: 0; text-align: left">
                <div class="palette-item-title">{{ row.entry.title }}</div>
                <div v-if="row.entry.subtitle" class="palette-item-sub">
                  {{ row.entry.subtitle }}
                </div>
              </div>
              <span v-if="row.entry.badge" class="badge badge-neutral">
                {{ row.entry.badge }}
              </span>
            </button>
          </div>
        </div>

        <div class="palette-foot">
          <span class="muted">{{ $t('palette.navigateHint') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
