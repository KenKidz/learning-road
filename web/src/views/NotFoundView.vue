<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
</script>

<template>
  <PageHeader :title="$t('notFound.title')" :subtitle="$t('notFound.subtitle')" />
  <div class="card">
    <EmptyState title="404" :text="$t('notFound.text')" icon="alert">
      <RouterLink to="/" class="btn btn-primary">{{ $t('notFound.back') }}</RouterLink>
    </EmptyState>
  </div>
</template>
