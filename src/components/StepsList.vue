<template>
  <ol class="space-y-0.5">
    <li
      v-for="(step, i) in steps"
      :key="i"
      class="flex items-start gap-1.5 text-xs text-gray-600"
    >
      <span class="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-medium text-[10px]">
        {{ i + 1 }}
      </span>
      <span class="leading-tight pt-0.5">{{ step }}</span>
    </li>
  </ol>
</template>

<script setup>
defineProps({
  steps: { type: Array, default: () => [] },
})
</script>
