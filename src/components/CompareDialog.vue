<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="$emit('close')"
        @keydown.esc.window="$emit('close')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60" @click="$emit('close')" />

        <!-- Panel -->
        <div
          class="relative z-10 w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 class="font-bold text-gray-900 text-base leading-tight">{{ title }}</h2>
              <p v-if="environment" class="text-xs text-indigo-600 font-medium mt-0.5">{{ environment }}</p>
              <!-- Env info badges -->
              <div v-if="envInfo" class="flex flex-wrap gap-1.5 mt-2">
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
            <button
              class="ml-4 shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              @click="$emit('close')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Image comparison -->
          <div class="grid grid-cols-2 gap-0.5 bg-gray-200 shrink-0">
            <div class="bg-gray-900 flex flex-col">
              <canvas ref="origCanvas" class="w-full block" style="image-rendering: pixelated;" />
              <span class="text-center text-[10px] text-gray-400 py-1">原圖</span>
            </div>
            <div class="bg-gray-900 flex flex-col">
              <canvas ref="processedCanvas" class="w-full block" style="image-rendering: pixelated;" />
              <span class="text-center text-[10px] text-gray-400 py-1">處理後</span>
            </div>
          </div>

          <!-- Steps -->
          <div v-if="steps && steps.length" class="px-5 py-4 overflow-y-auto">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">處理步驟</p>
            <ol class="space-y-1">
              <li
                v-for="(step, i) in steps"
                :key="i"
                class="flex items-start gap-2 text-sm text-gray-700"
              >
                <span class="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-medium text-[10px] mt-0.5">
                  {{ i + 1 }}
                </span>
                <span class="leading-tight pt-0.5">{{ step }}</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  environment: { type: String, default: '' },
  originalImageData: { type: Object, default: null },
  processedImageData: { type: Object, default: null },
  steps: { type: Array, default: () => [] },
  envInfo: { type: Object, default: null },
})

defineEmits(['close'])

const origCanvas = ref(null)
const processedCanvas = ref(null)

function drawImageData(canvas, imageData) {
  if (!canvas || !imageData) return
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(imageData, 0, 0)
}

watch(
  () => [props.visible, props.originalImageData, props.processedImageData],
  async () => {
    if (!props.visible) return
    await nextTick()
    drawImageData(origCanvas.value, props.originalImageData)
    drawImageData(processedCanvas.value, props.processedImageData)
  },
  { deep: true }
)

const brightnessBadgeClass = computed(() => {
  if (!props.envInfo) return ''
  const b = props.envInfo.brightness
  if (b < 60) return 'bg-blue-100 text-blue-700'
  if (b > 180) return 'bg-orange-100 text-orange-700'
  return 'bg-green-100 text-green-700'
})

const contrastBadgeClass = computed(() => {
  if (!props.envInfo) return ''
  const c = props.envInfo.contrast
  if (c < 20) return 'bg-yellow-100 text-yellow-700'
  if (c > 60) return 'bg-purple-100 text-purple-700'
  return 'bg-green-100 text-green-700'
})

const sharpnessBadgeClass = computed(() => {
  if (!props.envInfo) return ''
  const s = props.envInfo.sharpness
  if (s < 100) return 'bg-red-100 text-red-700'
  if (s > 500) return 'bg-green-100 text-green-700'
  return 'bg-yellow-100 text-yellow-700'
})
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
