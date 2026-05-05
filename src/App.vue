<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- 頂部 Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
      <h1 class="text-xl font-bold text-gray-900">Barcode 掃描策略 Demo</h1>
      <p class="text-sm text-gray-500 mt-0.5">
        10 種 OpenCV 影像增強策略，可視化各策略對圖像的處理結果
      </p>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- 左側面板：原圖 + 上傳 -->
      <aside class="w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col p-4 gap-4">
        <!-- OpenCV 狀態 -->
        <div
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
          :class="{
            'bg-yellow-50 text-yellow-700': cvStatus === 'loading',
            'bg-green-50 text-green-700': cvStatus === 'ready',
            'bg-red-50 text-red-700': cvStatus === 'error',
          }"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="{
              'bg-yellow-400 animate-pulse': cvStatus === 'loading',
              'bg-green-500': cvStatus === 'ready',
              'bg-red-500': cvStatus === 'error',
            }"
          />
          <span>
            {{
              cvStatus === 'loading'
                ? 'OpenCV.js 載入中…'
                : cvStatus === 'ready'
                ? 'OpenCV.js 已就緒'
                : 'OpenCV.js 載入失敗'
            }}
          </span>
        </div>

        <!-- 上傳區 -->
        <label
          class="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors"
          :class="
            cvStatus === 'ready'
              ? 'border-indigo-300 hover:bg-indigo-50 text-indigo-500'
              : 'border-gray-200 text-gray-300 cursor-not-allowed'
          "
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span class="text-sm font-medium">上傳圖片</span>
          <span class="text-xs text-gray-400">PNG / JPG / WEBP</span>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden"
            :disabled="cvStatus !== 'ready'"
            @change="onFileChange"
          />
        </label>

        <!-- 原圖預覽 -->
        <div v-if="originalImageSrc" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">原圖</span>
            <span class="text-xs text-gray-400">{{ originalSize }}</span>
          </div>
          <div class="rounded-lg overflow-hidden border border-gray-200 bg-gray-900">
            <img :src="originalImageSrc" class="w-full block" alt="原圖" />
          </div>
        </div>

        <!-- 執行按鈕 -->
        <button
          v-if="originalImageSrc"
          class="w-full py-2.5 rounded-xl font-semibold text-sm transition-colors"
          :class="
            isProcessing
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          "
          :disabled="isProcessing"
          @click="runAllStrategies"
        >
          <span v-if="isProcessing">處理中 {{ doneCount }} / {{ totalCount }}</span>
          <span v-else>執行所有策略</span>
        </button>

        <!-- 整體用時 -->
        <div v-if="totalElapsed != null && !isProcessing" class="text-center text-xs text-gray-400">
          全部完成，共 {{ totalElapsed }}ms
        </div>
      </aside>

      <!-- 右側：策略卡片 Grid -->
      <main class="flex-1 overflow-y-auto p-4">
        <div
          v-if="!originalImageSrc"
          class="h-full flex items-center justify-center text-gray-400 text-sm"
        >
          請先上傳圖片，再執行策略
        </div>

        <div
          v-else
          class="grid gap-4"
          style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));"
        >
          <div
            v-for="strategy in strategies"
            :key="strategy.id"
            class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
          >
            <StrategyCard
              :strategy="strategy"
              :result="results[strategy.id]"
              :status="statuses[strategy.id]"
              :originalImageData="originalImageData"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import StrategyCard from './components/StrategyCard.vue'
import { STRATEGIES } from './scannerStrategies.js'

const strategies = STRATEGIES

// OpenCV 狀態
const cvStatus = ref('loading') // loading | ready | error

onMounted(() => {
  if (window._opencvReady || (window.cv && window.cv.Mat)) {
    cvStatus.value = 'ready'
    return
  }
  window.addEventListener('opencv-ready', () => {
    cvStatus.value = 'ready'
  })
  window.addEventListener('opencv-error', () => {
    cvStatus.value = 'error'
  })
})

// 圖片狀態
const originalImageSrc = ref(null)
const originalSize = ref('')
const originalImageData = ref(null)

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (ev) => {
    originalImageSrc.value = ev.target.result
    const img = new Image()
    img.onload = () => {
      originalSize.value = `${img.naturalWidth} × ${img.naturalHeight}`
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      originalImageData.value = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight)
      resetResults()
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

// 結果與狀態
const results = reactive({})
const statuses = reactive({})
const isProcessing = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const totalElapsed = ref(null)

function resetResults() {
  for (const s of strategies) {
    results[s.id] = null
    statuses[s.id] = 'idle'
  }
  totalElapsed.value = null
}

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function runAllStrategies() {
  if (!originalImageData.value || isProcessing.value) return
  isProcessing.value = true
  doneCount.value = 0
  totalCount.value = strategies.length
  totalElapsed.value = null

  const globalStart = performance.now()

  for (const strategy of strategies) {
    statuses[strategy.id] = 'processing'
    await yieldToUI()

    const t0 = performance.now()
    let data = null
    try {
      data = strategy.run(originalImageData.value)
    } catch (e) {
      console.error(`策略 ${strategy.id} 執行失敗:`, e)
    }
    const elapsed = Math.round(performance.now() - t0)

    if (data === null || data === undefined) {
      statuses[strategy.id] = 'skipped'
      results[strategy.id] = null
    } else {
      statuses[strategy.id] = 'done'
      results[strategy.id] = { data, elapsed }
    }

    doneCount.value++
  }

  totalElapsed.value = Math.round(performance.now() - globalStart)
  isProcessing.value = false
}
</script>
