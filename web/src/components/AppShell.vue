<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './Icon.vue';
import LocaleSwitcher from './LocaleSwitcher.vue';
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
      <div class="brand">
        <div class="brand-mark">LR</div>
        <div>
          <div class="brand-name">Learning Road</div>
          <div class="brand-sub">{{ $t('app.brandTagline') }}</div>
        </div>
      </div>

      <nav class="side-nav" :aria-label="$t('nav.mainAria')">
        <p class="nav-section-label">{{ $t('nav.study') }}</p>
        <RouterLink
          v-for="item in studyNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
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
        >
          <Icon :name="item.icon" :size="17" />
          <span>{{ $t(item.labelKey) }}</span>
        </RouterLink>

        <p class="nav-section-label">{{ $t('nav.system') }}</p>
        <RouterLink to="/settings" class="nav-item">
          <Icon name="settings" :size="17" />
          <span>{{ $t('nav.settings') }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <LocaleSwitcher />
        <button type="button" class="btn btn-ghost" @click="toggle">
          <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="16" />
          {{ theme === 'dark' ? $t('app.themeLight') : $t('app.themeDark') }}
        </button>
        <button v-if="props.authRequired" type="button" class="btn btn-ghost" @click="emit('logout')">
          <Icon name="logout" :size="16" />
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
          <div class="brand-mark">LR</div>
          <span class="mobile-topbar-title">Learning Road</span>
        </div>
        <div class="row" style="gap: 6px">
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
</template>
