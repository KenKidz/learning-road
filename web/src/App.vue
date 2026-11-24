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

type AuthState = 'loading' | 'login' | 'ready';

const { t } = useI18n();
const authState = ref<AuthState>('loading');
const authRequired = ref(false);
const password = ref('');
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
    <div class="row">
      <span class="spinner" />
      <span class="muted">{{ t('app.connecting') }}</span>
    </div>
  </div>

  <div v-else-if="authState === 'login'" class="login-screen">
    <form class="login-card" @submit.prevent="submitLogin">
      <div class="login-brand">
        <div class="brand-mark">LR</div>
        <div>
          <div class="brand-name">Learning Road</div>
          <div class="brand-sub">{{ t('app.brandTagline') }}</div>
        </div>
      </div>
      <LocaleSwitcher />
      <p class="muted">
        {{ t('app.loginIntro') }}
      </p>
      <div class="field">
        <label class="field-label" for="login-password">{{ t('app.password') }}</label>
        <input
          id="login-password"
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          autofocus
        />
      </div>
      <p v-if="loginError" class="form-error">{{ loginError }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="submitting">
        <span v-if="submitting" class="spinner" />
        <Icon v-else name="lock" :size="16" />
        {{ t('app.login') }}
      </button>
      <button type="button" class="btn btn-ghost" @click="checkAuth">{{ t('app.retryConnection') }}</button>
    </form>
  </div>

  <AppShell v-else :auth-required="authRequired" @logout="logout">
    <RouterView />
  </AppShell>

  <ToastHost />
  <ConfirmHost />
</template>
