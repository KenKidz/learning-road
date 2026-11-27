<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './Icon.vue';
import LocaleSwitcher from './LocaleSwitcher.vue';
import FocusTimerWidget from './FocusTimerWidget.vue';
import CommandPalette from './CommandPalette.vue';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{ authRequired: boolean }>();
const emit = defineEmits<{ logout: [] }>();

const route = useRoute();
const { theme, toggle } = useTheme();
const mobileOpen = ref(false);

const studyNav = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'dashboard' },
  { to: '/roadmap', labelKey: 'nav.roadmap', icon: 'roadmap' },
  { to: '/planner', labelKey: 'nav.planner', icon: 'planner' },
  { to: '/notes', labelKey: 'nav.notes', icon: 'notes' },
];

const careerNav = [
  { to: '/projects', labelKey: 'nav.projects', icon: 'projects' },
  { to: '/interview', labelKey: 'nav.interview', icon: 'interview' },
  { to: '/jobs', labelKey: 'nav.jobs', icon: 'jobs' },
];

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(`${to}/`);
}

function openSearchPalette() {
  window.dispatchEvent(new CustomEvent('lr:open-command-palette'));
}

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  },
);
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <div class="sidebar-top">
        <RouterLink to="/" class="brand">
          <div class="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19L10 5M14 5l6 14M12 17v2M12 11v2M12 5v2" />
            </svg>
          </div>
          <div class="grow">
            <div class="brand-name">Learning Road</div>
            <div class="brand-sub">{{ $t('app.brandTagline') }}</div>
          </div>
        </RouterLink>
        <button
          type="button"
          class="btn btn-ghost btn-icon btn-sm mobile-close-btn"
          :aria-label="$t('app.closeMenu')"
          @click="mobileOpen = false"
        >
          <Icon name="close" :size="16" />
        </button>
      </div>

      <div class="sidebar-search-wrap">
        <button type="button" class="sidebar-search-btn" @click="openSearchPalette">
          <Icon name="search" :size="14" />
          <span class="sidebar-search-label">{{ $t('palette.trigger') }}</span>
          <span class="kbd">Ctrl+K</span>
        </button>
      </div>

      <nav class="side-nav" :aria-label="$t('nav.mainAria')">
        <p class="nav-section-label">{{ $t('nav.study') }}</p>
        <RouterLink
          v-for="item in studyNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
        >
          <Icon :name="item.icon" :size="17" />
          <span>{{ $t(item.labelKey) }}</span>
        </RouterLink>

        <p class="nav-section-label">{{ $t('nav.career') }}</p>
        <RouterLink
          v-for="item in careerNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
        >
          <Icon :name="item.icon" :size="17" />
          <span>{{ $t(item.labelKey) }}</span>
        </RouterLink>

        <p class="nav-section-label">{{ $t('nav.system') }}</p>
        <RouterLink
          to="/settings"
          class="nav-item"
          :class="{ active: isActive('/settings') }"
        >
          <Icon name="settings" :size="17" />
          <span>{{ $t('nav.settings') }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <FocusTimerWidget />
        <div class="sidebar-controls">
          <button
            type="button"
            class="btn btn-sm grow theme-toggle-btn"
            :aria-label="theme === 'dark' ? $t('app.switchToLight') : $t('app.switchToDark')"
            @click="toggle"
          >
            <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="15" />
            <span>{{ theme === 'dark' ? $t('app.themeLight') : $t('app.themeDark') }}</span>
          </button>
          <LocaleSwitcher compact />
        </div>
        <button v-if="props.authRequired" type="button" class="btn btn-ghost btn-sm btn-block" @click="emit('logout')">
          <Icon name="logout" :size="15" />
          {{ $t('app.logout') }}
        </button>
        <p class="sidebar-note">
          {{ $t('app.localDataNote') }}
        </p>
      </div>
    </aside>

    <div class="scrim" :class="{ show: mobileOpen }" @click="mobileOpen = false" />

    <div class="main">
      <div class="mobile-topbar">
        <div class="row">
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="$t('app.openMenu')"
            @click="mobileOpen = true"
          >
            <Icon name="menu" />
          </button>
          <RouterLink to="/" class="row" style="gap: 8px">
            <div class="brand-mark" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19L10 5M14 5l6 14M12 17v2M12 11v2M12 5v2" />
              </svg>
            </div>
            <span class="mobile-topbar-title">Learning Road</span>
          </RouterLink>
        </div>
        <div class="row" style="gap: 6px">
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="$t('palette.trigger')"
            @click="openSearchPalette"
          >
            <Icon name="search" :size="16" />
          </button>
          <FocusTimerWidget compact />
          <LocaleSwitcher compact />
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="theme === 'dark' ? $t('app.switchToLight') : $t('app.switchToDark')"
            @click="toggle"
          >
            <Icon :name="theme === 'dark' ? 'sun' : 'moon'" />
          </button>
        </div>
      </div>

      <main class="content">
        <slot />
      </main>
    </div>
  </div>
  <CommandPalette />
</template>
