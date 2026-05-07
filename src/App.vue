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
          <!-- 環境資訊 badges -->
          <div v-if="envInfo" class="flex flex-wrap gap-1.5">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" :class="brightnessBadgeClass">
              <span>亮度</span>
              <span class="font-bold">{{ envInfo.brightness.toFixed(0) }}</span>
              <span class="opacity-70">{{ envInfo.brightnessLabel }}</span>
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" :class="contrastBadgeClass">
              <span>對比</span>
              <span class="font-bold">{{ envInfo.contrast.toFixed(1) }}</span>
              <span class="opacity-70">{{ envInfo.contrastLabel }}</span>
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" :class="sharpnessBadgeClass">
              <span>清晰度</span>
              <span class="font-bold">{{ envInfo.sharpness.toFixed(0) }}</span>
              <span class="opacity-70">{{ envInfo.sharpnessLabel }}</span>
            </span>
          </div>
        </div>

        <!-- 環境篩選 -->
        <div v-if="originalImageSrc" class="space-y-1.5">
          <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">環境篩選</span>
          <div class="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button
              v-for="opt in envFilterOptions"
              :key="opt.value"
              class="flex-1 py-1.5 text-center transition-colors"
              :class="envFilter === opt.value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              @click="envFilter = opt.value"
            >{{ opt.label }}</button>
          </div>
          <div v-if="detectedEnv" class="text-[11px] text-gray-400">
            自動偵測：<span class="font-medium" :class="detectedEnv === 'dark' ? 'text-blue-600' : 'text-green-600'">{{ detectedEnv === 'dark' ? '暗處環境' : '一般環境' }}</span>
          </div>
        </div>

        <!-- Focus 模式 -->
        <div v-if="originalImageSrc" class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Focus 裁切</span>
            <button
              class="text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors"
              :class="focusMode ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="toggleFocusMode"
            >{{ focusMode ? '取消裁切' : '開啟裁切' }}</button>
          </div>
          <div v-if="croppedImageSrc" class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">裁切區域</span>
              <button class="text-[11px] text-red-500 hover:text-red-700" @click="clearCrop">清除</button>
            </div>
            <div class="rounded-lg overflow-hidden border border-indigo-200 bg-gray-900">
              <img :src="croppedImageSrc" class="w-full block" alt="裁切區域" />
            </div>
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
          <span v-else>執行{{ croppedImageData ? '（裁切區域）' : '所有' }}策略</span>
        </button>

        <!-- 整體用時 -->
        <div v-if="totalElapsed != null && !isProcessing" class="text-center text-xs text-gray-400">
          全部完成，共 {{ totalElapsed }}ms
        </div>
      </aside>

      <!-- 右側：策略卡片 Grid -->
      <main class="flex-1 overflow-y-auto p-4">
        <!-- Focus 裁切覆蓋層 -->
        <div v-if="focusMode && originalImageSrc" class="flex flex-col items-center gap-3 pb-4">
          <div class="text-sm text-gray-600 font-medium">拖曳選取要裁切的區域</div>
          <div class="relative inline-block select-none" ref="focusContainer">
            <img
              :src="originalImageSrc"
              class="max-w-full max-h-[60vh] block rounded-lg"
              ref="focusImg"
              @load="onFocusImgLoad"
              draggable="false"
            />
            <canvas
              ref="focusCanvas"
              class="absolute inset-0 cursor-crosshair"
              @mousedown="onCropStart"
              @mousemove="onCropMove"
              @mouseup="onCropEnd"
              @mouseleave="onCropEnd"
              @touchstart.prevent="onCropTouchStart"
              @touchmove.prevent="onCropTouchMove"
              @touchend="onCropEnd"
            />
          </div>
          <button
            v-if="cropRect"
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            @click="applyCrop"
          >確認裁切</button>
        </div>

        <div
          v-if="!originalImageSrc"
          class="h-full flex items-center justify-center text-gray-400 text-sm"
        >
          請先上傳圖片，再執行策略
        </div>

        <div
          v-else-if="!focusMode"
          class="grid gap-4"
          style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));"
        >
          <div
            v-for="item in flattenedItems"
            :key="item.key"
            class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
          >
            <StrategyCard
              :strategy="item.virtualStrategy"
              :result="item.result"
              :status="item.status"
              :originalImageData="originalImageData"
              :envInfo="envInfo"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import StrategyCard from './components/StrategyCard.vue'
import { STRATEGIES } from './scannerStrategies.js'

const LOW_LIGHT_THRESHOLD = 115

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
const envInfo = ref(null)

// ── 環境篩選 ────────────────────────────────────────────────────────────────
const envFilter = ref('auto') // 'auto' | 'all' | 'normal' | 'dark'
const envFilterOptions = [
  { value: 'auto', label: '自動' },
  { value: 'all', label: '全部' },
  { value: 'normal', label: '一般' },
  { value: 'dark', label: '暗處' },
]
const detectedEnv = computed(() => {
  if (!envInfo.value) return null
  return envInfo.value.brightness < LOW_LIGHT_THRESHOLD ? 'dark' : 'normal'
})
const activeEnvFilter = computed(() => {
  if (envFilter.value === 'auto') return detectedEnv.value || 'normal'
  if (envFilter.value === 'all') return 'all'
  return envFilter.value
})
const filteredStrategies = computed(() => {
  if (activeEnvFilter.value === 'all') return strategies
  return strategies.filter(s => s.envCategory === activeEnvFilter.value || s.envCategory === 'both')
})

// ── Focus 裁切 ──────────────────────────────────────────────────────────────
const focusMode = ref(false)
const focusImg = ref(null)
const focusCanvas = ref(null)
const focusContainer = ref(null)
const cropRect = ref(null) // { x, y, w, h } in image pixel coords
const croppedImageData = ref(null)
const croppedImageSrc = ref(null)
let cropStart = null
let isCropping = false

function toggleFocusMode() {
  focusMode.value = !focusMode.value
  if (!focusMode.value) {
    cropRect.value = null
  }
}

function clearCrop() {
  croppedImageData.value = null
  croppedImageSrc.value = null
  cropRect.value = null
}

function onFocusImgLoad() {
  const img = focusImg.value
  const canvas = focusCanvas.value
  if (!img || !canvas) return
  canvas.width = img.clientWidth
  canvas.height = img.clientHeight
  drawCropOverlay()
}

function getCanvasCoords(e) {
  const canvas = focusCanvas.value
  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

function onCropStart(e) {
  isCropping = true
  cropStart = getCanvasCoords(e)
  cropRect.value = null
}

function onCropMove(e) {
  if (!isCropping || !cropStart) return
  const cur = getCanvasCoords(e)
  const x = Math.min(cropStart.x, cur.x)
  const y = Math.min(cropStart.y, cur.y)
  const w = Math.abs(cur.x - cropStart.x)
  const h = Math.abs(cur.y - cropStart.y)
  cropRect.value = { x, y, w, h }
  drawCropOverlay()
}

function onCropEnd() {
  isCropping = false
}

function onCropTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  isCropping = true
  const canvas = focusCanvas.value
  const rect = canvas.getBoundingClientRect()
  cropStart = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  cropRect.value = null
}

function onCropTouchMove(e) {
  if (!isCropping || !cropStart || e.touches.length !== 1) return
  const touch = e.touches[0]
  const canvas = focusCanvas.value
  const rect = canvas.getBoundingClientRect()
  const cur = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  const x = Math.min(cropStart.x, cur.x)
  const y = Math.min(cropStart.y, cur.y)
  const w = Math.abs(cur.x - cropStart.x)
  const h = Math.abs(cur.y - cropStart.y)
  cropRect.value = { x, y, w, h }
  drawCropOverlay()
}

function drawCropOverlay() {
  const canvas = focusCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!cropRect.value) return
  const { x, y, w, h } = cropRect.value
  // Dim area outside crop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.clearRect(x, y, w, h)
  // Border
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
}

function applyCrop() {
  if (!cropRect.value || !originalImageData.value || !focusImg.value) return
  const img = focusImg.value
  const scaleX = originalImageData.value.width / img.clientWidth
  const scaleY = originalImageData.value.height / img.clientHeight
  const { x, y, w, h } = cropRect.value
  const sx = Math.round(x * scaleX)
  const sy = Math.round(y * scaleY)
  const sw = Math.round(w * scaleX)
  const sh = Math.round(h * scaleY)
  if (sw < 10 || sh < 10) return

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  // Draw original full image then extract
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = originalImageData.value.width
  srcCanvas.height = originalImageData.value.height
  const srcCtx = srcCanvas.getContext('2d')
  srcCtx.putImageData(originalImageData.value, 0, 0)
  ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh)

  croppedImageData.value = ctx.getImageData(0, 0, sw, sh)
  croppedImageSrc.value = canvas.toDataURL()
  focusMode.value = false
}

// ── 環境資訊計算 ────────────────────────────────────────────────────────────
function computeEnvInfo(imageData) {
  const { data, width, height } = imageData
  const n = width * height

  // Mean Brightness (grayscale)
  let sumGray = 0
  for (let i = 0; i < data.length; i += 4) {
    sumGray += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const brightness = sumGray / n

  // RMS Contrast
  let sumSq = 0
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sumSq += (gray - brightness) ** 2
  }
  const contrast = Math.sqrt(sumSq / n)

  // Laplacian Variance (sharpness) via OpenCV
  let sharpness = 0
  try {
    const cv = window.cv
    if (cv && cv.Mat) {
      const src = cv.matFromImageData(imageData)
      const gray = new cv.Mat()
      const lap = new cv.Mat()
      const meanMat = new cv.Mat()
      const stdMat = new cv.Mat()
      try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
        cv.Laplacian(gray, lap, cv.CV_64F)
        cv.meanStdDev(lap, meanMat, stdMat)
        const std = stdMat.data64F[0]
        sharpness = std * std
      } finally {
        src.delete(); gray.delete(); lap.delete(); meanMat.delete(); stdMat.delete()
      }
    }
  } catch (_) { /* graceful degradation */ }

  const brightnessLabel = brightness < 60 ? '偏暗' : brightness > 180 ? '偏亮' : '正常'
  const contrastLabel = contrast < 20 ? '低對比' : contrast > 60 ? '高對比' : '正常'
  const sharpnessLabel = sharpness < 100 ? '模糊' : sharpness > 500 ? '清晰' : '普通'

  return { brightness, contrast, sharpness, brightnessLabel, contrastLabel, sharpnessLabel }
}

const brightnessBadgeClass = computed(() => {
  if (!envInfo.value) return ''
  const b = envInfo.value.brightness
  if (b < 60) return 'bg-blue-100 text-blue-700'
  if (b > 180) return 'bg-orange-100 text-orange-700'
  return 'bg-green-100 text-green-700'
})
const contrastBadgeClass = computed(() => {
  if (!envInfo.value) return ''
  const c = envInfo.value.contrast
  if (c < 20) return 'bg-yellow-100 text-yellow-700'
  if (c > 60) return 'bg-purple-100 text-purple-700'
  return 'bg-green-100 text-green-700'
})
const sharpnessBadgeClass = computed(() => {
  if (!envInfo.value) return ''
  const s = envInfo.value.sharpness
  if (s < 100) return 'bg-red-100 text-red-700'
  if (s > 500) return 'bg-green-100 text-green-700'
  return 'bg-yellow-100 text-yellow-700'
})

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  clearCrop()
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
      envInfo.value = computeEnvInfo(originalImageData.value)
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

// ── 將 multiResult 策略展開為獨立虛擬卡片 ─────────────────────────────────
const MULTI_RESULT_LABELS = ['上方帶 (y=20%)', '中央帶 (y=35%)', '下方帶 (y=50%)']

const flattenedItems = computed(() => {
  const items = []
  for (const strategy of filteredStrategies.value) {
    if (strategy.multiResult) {
      const res = results[strategy.id]
      const st = statuses[strategy.id]
      const subResults = st === 'done' && Array.isArray(res?.data) ? res.data : null
      for (let i = 0; i < 3; i++) {
        const label = subResults?.[i]?.label ?? MULTI_RESULT_LABELS[i]
        items.push({
          key: `${strategy.id}_${i}`,
          virtualStrategy: {
            id: `${strategy.id}_${i}`,
            displayName: label,
            environment: strategy.environment,
            description: strategy.description,
          },
          result: subResults
            ? { data: { imageData: subResults[i].imageData, steps: subResults[i].steps }, elapsed: i === 0 ? res.elapsed : null }
            : null,
          status: st,
        })
      }
    } else {
      items.push({
        key: strategy.id,
        virtualStrategy: strategy,
        result: results[strategy.id],
        status: statuses[strategy.id],
      })
    }
  }
  return items
})

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function runAllStrategies() {
  if (!originalImageData.value || isProcessing.value) return
  isProcessing.value = true

  const targetStrategies = filteredStrategies.value
  const inputImageData = croppedImageData.value || originalImageData.value

  doneCount.value = 0
  totalCount.value = targetStrategies.length
  totalElapsed.value = null

  const globalStart = performance.now()

  for (const strategy of targetStrategies) {
    statuses[strategy.id] = 'processing'
    await yieldToUI()

    const t0 = performance.now()
    let data = null
    try {
      data = strategy.run(inputImageData)
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
