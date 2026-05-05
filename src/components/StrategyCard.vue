<template>
  <!-- 多結果（strategyDetectAndCropBarcode）：展開為子卡片列表 -->
  <div v-if="strategy.multiResult && Array.isArray(result?.data)">
    <div class="px-3 pt-3 pb-2 border-b border-gray-100">
      <h3 class="font-semibold text-gray-800 text-sm leading-tight">{{ strategy.displayName }}</h3>
      <span class="text-xs text-indigo-600 font-medium">{{ strategy.environment }}</span>
    </div>
    <div class="space-y-3 px-3 py-3">
      <div
        v-for="(sub, i) in result.data"
        :key="i"
        class="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden"
      >
        <div class="flex items-center justify-between px-2 py-1 bg-gray-100">
          <span class="text-xs font-medium text-gray-600">{{ sub.label }}</span>
          <span v-if="i === 0 && result.elapsed != null" class="text-xs text-gray-400">
            {{ result.elapsed }}ms
          </span>
        </div>
        <!-- 左原圖 右處理後 -->
        <div class="grid grid-cols-2 gap-0.5 bg-gray-200">
          <div class="bg-gray-900">
            <canvas
              ref="origSubCanvasRefs"
              class="w-full block"
              style="image-rendering: pixelated;"
            />
          </div>
          <div class="bg-gray-900">
            <canvas
              :ref="el => setSubCanvas(el, i)"
              class="w-full block"
              style="image-rendering: pixelated;"
            />
          </div>
        </div>
        <div class="flex text-[10px] text-gray-400">
          <span class="flex-1 text-center py-0.5 border-r border-gray-100">原圖</span>
          <span class="flex-1 text-center py-0.5">處理後</span>
        </div>
        <div class="px-2 py-1">
          <StepsList :steps="sub.steps" />
        </div>
      </div>
    </div>
    <!-- 技術說明 -->
    <div class="px-3 pb-3">
      <p class="text-xs text-gray-500 leading-relaxed">{{ strategy.description }}</p>
    </div>
  </div>

  <!-- 單一結果（其他策略）或錯誤狀態 -->
  <div v-else class="flex flex-col h-full">
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

    <!-- 比對區（左原圖 右處理後） -->
    <div
      v-if="status === 'done'"
      class="grid grid-cols-2 gap-0.5 bg-gray-200"
    >
      <div class="bg-gray-900">
        <canvas ref="origCanvas" class="w-full block" style="image-rendering: pixelated;" />
      </div>
      <div class="bg-gray-900">
        <canvas ref="singleCanvas" class="w-full block" style="image-rendering: pixelated;" />
      </div>
    </div>
    <!-- 標籤 -->
    <div v-if="status === 'done'" class="flex text-[10px] text-gray-400 border-b border-gray-100">
      <span class="flex-1 text-center py-0.5 border-r border-gray-100">原圖</span>
      <span class="flex-1 text-center py-0.5">處理後</span>
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
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import StepsList from './StepsList.vue'

const props = defineProps({
  strategy: { type: Object, required: true },
  result: { type: Object, default: null },
  status: { type: String, default: 'idle' }, // idle | processing | done | skipped | error
  originalImageData: { type: Object, default: null }, // ImageData of original image
})

const singleCanvas = ref(null)
const origCanvas = ref(null)
const subCanvasRefs = ref([])
const origSubCanvasRefs = ref([])

function setSubCanvas(el, i) {
  subCanvasRefs.value[i] = el
}

function drawImageData(canvas, imageData) {
  if (!canvas || !imageData) return
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(imageData, 0, 0)
}

watch(
  () => [props.result, props.status, props.originalImageData],
  async () => {
    await nextTick()
    if (props.status !== 'done' || !props.result) return

    if (props.strategy.multiResult && Array.isArray(props.result.data)) {
      props.result.data.forEach((sub, i) => {
        drawImageData(subCanvasRefs.value[i], sub.imageData)
        // 多結果卡：每個子卡都畫原圖
        if (origSubCanvasRefs.value[i]) {
          drawImageData(origSubCanvasRefs.value[i], props.originalImageData)
        }
      })
    } else if (props.result.data?.imageData) {
      drawImageData(singleCanvas.value, props.result.data.imageData)
      drawImageData(origCanvas.value, props.originalImageData)
    }
  },
  { deep: true }
)
</script>
