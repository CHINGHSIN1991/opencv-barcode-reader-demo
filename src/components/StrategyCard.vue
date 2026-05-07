<template>
  <div class="flex flex-col h-full">
    <!-- 卡片頭 -->
    <div class="px-3 pt-3 pb-2 border-b border-gray-100">
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-semibold text-gray-800 text-sm leading-tight">{{ strategy.displayName }}</h3>
        <span
          v-if="result?.elapsed != null"
          class="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5"
        >{{ result.elapsed }}ms</span>
      </div>
      <span class="text-xs text-indigo-600 font-medium">{{ strategy.environment }}</span>
    </div>

    <!-- 處理後圖片（可雙擊比對） -->
    <div
      v-if="status === 'done'"
      class="relative group cursor-zoom-in"
      @dblclick="showDialog = true"
    >
      <canvas ref="singleCanvas" class="w-full block" style="image-rendering: pixelated;" />
      <!-- 雙擊提示 overlay -->
      <div class="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        雙擊預覽
      </div>
    </div>

    <!-- 其他狀態 -->
    <div
      v-else
      class="bg-gray-900 flex items-center justify-center min-h-[80px]"
    >
      <span v-if="status === 'idle'" class="text-gray-500 text-xs">等待圖片上傳…</span>
      <span v-else-if="status === 'processing'" class="text-gray-400 text-xs animate-pulse">處理中…</span>
      <span v-else-if="status === 'skipped'" class="text-yellow-400 text-xs">策略跳過（條件不符）</span>
      <span v-else-if="status === 'error'" class="text-red-400 text-xs">處理失敗</span>
    </div>

    <!-- 處理步驟 -->
    <div class="px-3 py-2 grow">
      <StepsList v-if="result?.data?.steps" :steps="result.data.steps" />
    </div>

    <!-- 技術說明 -->
    <div class="px-3 pb-3">
      <p class="text-xs text-gray-500 leading-relaxed">{{ strategy.description }}</p>
    </div>
  </div>

  <!-- 比對 Dialog -->
  <CompareDialog
    :visible="showDialog"
    :title="strategy.displayName"
    :environment="strategy.environment"
    :originalImageData="originalImageData"
    :processedImageData="processedImageData"
    :steps="result?.data?.steps ?? []"
    :envInfo="envInfo"
    @close="showDialog = false"
  />
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import StepsList from './StepsList.vue'
import CompareDialog from './CompareDialog.vue'

const props = defineProps({
  strategy: { type: Object, required: true },
  result: { type: Object, default: null },
  status: { type: String, default: 'idle' }, // idle | processing | done | skipped | error
  originalImageData: { type: Object, default: null },
  envInfo: { type: Object, default: null },
})

const singleCanvas = ref(null)
const showDialog = ref(false)

const processedImageData = computed(() => props.result?.data?.imageData ?? null)

function drawImageData(canvas, imageData) {
  if (!canvas || !imageData) return
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(imageData, 0, 0)
}

watch(
  () => [props.result, props.status],
  async () => {
    await nextTick()
    if (props.status !== 'done' || !props.result) return
    drawImageData(singleCanvas.value, props.result.data?.imageData)
  },
  { deep: true }
)
</script>
