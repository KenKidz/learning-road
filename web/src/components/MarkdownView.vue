<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{ content: string }>();

const html = computed(() => {
  if (!props.content.trim()) return '';
  const raw = marked.parse(props.content, { async: false });
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitized with DOMPurify -->
  <div v-if="html" class="markdown" v-html="html" />
  <p v-else class="muted">{{ $t('common.noData') }}</p>
</template>
