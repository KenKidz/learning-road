<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppShell from './components/AppShell.vue';
import ConfirmHost from './components/ConfirmHost.vue';
import ToastHost from './components/ToastHost.vue';
import LocaleSwitcher from './components/LocaleSwitcher.vue';
import Icon from './components/Icon.vue';
import { api, ApiError } from './lib/api';
import { useToast } from './composables/useToast';
import { useTheme } from './composables/useTheme';

type AuthState = 'loading' | 'login' | 'ready';

const { t } = useI18n();
const { theme, toggle } = useTheme();
const authState = ref<AuthState>('loading');
const authRequired = ref(false);
const password = ref('');
const showPassword = ref(false);
const loginError = ref('');
const submitting = ref(false);
const toast = useToast();

async function checkAuth() {
  try {
    const status = await api.authStatus();
    authRequired.value = status.required;
    authState.value = status.authenticated ? 'ready' : 'login';
  } catch {
    authState.value = 'login';
    authRequired.value = true;
    loginError.value = t('app.connectionError');
  }
}

function showLogin() {
  authRequired.value = true;
  authState.value = 'login';
}

async function submitLogin() {
  if (!password.value) {
    loginError.value = t('app.passwordRequired');
    return;
  }
  submitting.value = true;
  loginError.value = '';
  try {
    await api.login(password.value);
    password.value = '';
    authState.value = 'ready';
    toast.success(t('app.loginSuccess'));
  } catch (error) {
    loginError.value =
      error instanceof ApiError ? error.message : t('app.loginFailed');
  } finally {
    submitting.value = false;
  }
}

async function logout() {
  try {
    await api.logout();
  } finally {
    authState.value = 'login';
    authRequired.value = true;
  }
}

onMounted(() => {
  window.addEventListener('lr:unauthorized', showLogin);
  void checkAuth();
});

onBeforeUnmount(() => {
  window.removeEventListener('lr:unauthorized', showLogin);
});
</script>

<template>
  <div v-if="authState === 'loading'" class="login-screen">
    <div class="login-loading-card">
      <div class="brand-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19L10 5M14 5l6 14M12 17v2M12 11v2M12 5v2" />
        </svg>
      </div>
      <div class="row" style="gap: 8px">
        <span class="spinner" />
        <span class="muted">{{ t('app.connecting') }}</span>
      </div>
    </div>
  </div>

  <div v-else-if="authState === 'login'" class="login-screen">
    <form class="login-card" @submit.prevent="submitLogin">
      <div class="row-between">
        <div class="login-brand">
          <div class="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19L10 5M14 5l6 14M12 17v2M12 11v2M12 5v2" />
            </svg>
          </div>
          <div>
            <div class="brand-name">Learning Road</div>
            <div class="brand-sub">{{ t('app.brandTagline') }}</div>
          </div>
        </div>
        <div class="row" style="gap: 6px">
          <LocaleSwitcher compact />
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            :aria-label="theme === 'dark' ? t('app.switchToLight') : t('app.switchToDark')"
            @click="toggle"
          >
            <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="15" />
          </button>
        </div>
      </div>

      <p class="muted">
        {{ t('app.loginIntro') }}
      </p>

      <div class="field">
        <label class="field-label" for="login-password">{{ t('app.password') }}</label>
        <div class="input-wrap">
          <input
            id="login-password"
            v-model="password"
            class="input input-has-right"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            autofocus
          />
          <button
            type="button"
            class="input-action-right"
            :aria-label="showPassword ? t('app.hidePassword') : t('app.showPassword')"
            @click="showPassword = !showPassword"
          >
            <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />
          </button>
        </div>
      </div>

      <p v-if="loginError" class="form-error">{{ loginError }}</p>

      <div class="stack-sm">
        <button type="submit" class="btn btn-primary btn-block" :disabled="submitting">
          <span v-if="submitting" class="spinner" />
          <Icon v-else name="lock" :size="16" />
          {{ t('app.login') }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm btn-block" @click="checkAuth">
          {{ t('app.retryConnection') }}
        </button>
      </div>
    </form>
  </div>

  <AppShell v-else :auth-required="authRequired" @logout="logout">
    <RouterView />
  </AppShell>

  <ToastHost />
  <ConfirmHost />
</template>
