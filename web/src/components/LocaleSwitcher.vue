<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale, type AppLocale } from '../i18n';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const { locale, t } = useI18n();

function change(next: AppLocale) {
  setLocale(next);
}
</script>

<template>
  <div class="tabs locale-switcher" :class="{ compact: props.compact }" role="group" :aria-label="t('app.language')">
    <button
      v-for="item in SUPPORTED_LOCALES"
      :key="item"
      type="button"
      class="tab"
      :class="{ active: locale === item }"
      :aria-pressed="locale === item"
      @click="change(item)"
    >
      {{ item.toUpperCase() }}
    </button>
  </div>
</template>
