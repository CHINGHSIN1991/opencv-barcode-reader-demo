/**
 * scannerStrategies.js
 * 整合所有 OpenCV 影像增強策略，供 Demo 頁面使用。
 * 每個策略包含：id、displayName、environment（適用掃描環境）、
 * description（技術說明）、run（執行函式）。
 *
 * run(imageData) 回傳：
 *   - { imageData, steps } — 單一結果
 *   - [{ imageData, steps, label }, ...] — 多結果（strategyDetectAndCropBarcode）
 *   - null — 策略無法處理此影像
 */

// ── Canvas Pool（cropImageData 專用）────────────────────────────────────────
let cropSrcCanvas = null
let cropDstCanvas = null

const GAMMA_LUT_DATA = (() => {
  const data = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    data[i] = Math.round(255 * Math.pow(i / 255, 0.5))
  }
  return data
})()

export function resetCanvasPool() {
  cropSrcCanvas = null
  cropDstCanvas = null
}

function matToImageData(mat) {
  const cv = window.cv
  const rgba = new cv.Mat()
  try {
    if (mat.channels() === 1) {
      cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA)
    } else {
      mat.copyTo(rgba)
    }
    return new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows)
  } finally {
    rgba.delete()
  }
}

function detectBarcodeContours(gray, { thresholdVal = 225, morphIterations = 4 } = {}) {
  const cv = window.cv
  const gradX = new cv.Mat()
  const gradY = new cv.Mat()
  const grad = new cv.Mat()
  const blurred = new cv.Mat()
  const thresh = new cv.Mat()
  const morphed = new cv.Mat()
  let contours = null
  let closeKernel = null
  let erodeKernel = null
  let hierarchy = null

  const cleanup = () => {
    gradX.delete()
    gradY.delete()
    grad.delete()
    blurred.delete()
    thresh.delete()
    morphed.delete()
    if (closeKernel) closeKernel.delete()
    if (erodeKernel) erodeKernel.delete()
    if (hierarchy) hierarchy.delete()
  }

  try {
    cv.Sobel(gray, gradX, cv.CV_32F, 1, 0, 3)
    cv.convertScaleAbs(gradX, gradX)
    cv.Sobel(gray, gradY, cv.CV_32F, 0, 1, 3)
    cv.convertScaleAbs(gradY, gradY)
    cv.subtract(gradX, gradY, grad)
    cv.GaussianBlur(grad, blurred, new cv.Size(9, 9), 0)
    cv.threshold(blurred, thresh, thresholdVal, 255, cv.THRESH_BINARY)

    closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(21, 7))
    cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, closeKernel)

    erodeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(4, 4))
    for (let i = 0; i < morphIterations; i++) {
      cv.erode(morphed, morphed, erodeKernel)
    }
    for (let i = 0; i < morphIterations; i++) {
      cv.dilate(morphed, morphed, erodeKernel)
    }

    contours = new cv.MatVector()
    hierarchy = new cv.Mat()
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    return {
      contours,
      cleanup,
    }
  } catch (e) {
    if (contours) contours.delete()
    cleanup()
    return null
  }
}

// ── 策略定義 ──────────────────────────────────────────────────────────────────

function runClaheOnly(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const enhanced = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
    clahe.apply(gray, enhanced)
    clahe.delete()
    return { imageData: matToImageData(enhanced), steps: ['灰階化', 'CLAHE(clipLimit=2.0, tile=8×8)'] }
  } finally {
    src.delete()
    gray.delete()
    enhanced.delete()
  }
}

function runSharpenOnly(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const sharpened = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(0, 0), 3)
    cv.addWeighted(gray, 1.5, blurred, -0.5, 0, sharpened)
    return {
      imageData: matToImageData(sharpened),
      steps: ['灰階化', 'GaussianBlur(σ=3)', 'addWeighted(1.5, −0.5) → Unsharp Mask'],
    }
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    sharpened.delete()
  }
}

function runCenterCropClahe(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const cropW = Math.floor(src.cols * 0.6)
  const cropH = Math.floor(src.rows * 0.6)
  const cropX = Math.floor((src.cols - cropW) / 2)
  const cropY = Math.floor((src.rows - cropH) / 2)
  const roi = src.roi(new cv.Rect(cropX, cropY, cropW, cropH))
  const upscaled = new cv.Mat()
  const gray = new cv.Mat()
  const enhanced = new cv.Mat()
  try {
    cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC)
    cv.cvtColor(upscaled, gray, cv.COLOR_RGBA2GRAY)
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8))
    clahe.apply(gray, enhanced)
    clahe.delete()
    return {
      imageData: matToImageData(enhanced),
      steps: ['中央裁切 60%×60%', '雙三次插值放大 2x (INTER_CUBIC)', '灰階化', 'CLAHE(clipLimit=3.0)'],
    }
  } finally {
    src.delete()
    roi.delete()
    upscaled.delete()
    gray.delete()
    enhanced.delete()
  }
}

function runAdaptiveThreshold(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const enhanced = new cv.Mat()
  const binary = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
    clahe.apply(gray, enhanced)
    clahe.delete()
    cv.adaptiveThreshold(
      enhanced,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      5
    )
    return {
      imageData: matToImageData(binary),
      steps: [
        '灰階化',
        'CLAHE(clipLimit=2.0)',
        'adaptiveThreshold(GAUSSIAN_C, blockSize=31, C=5)',
      ],
    }
  } finally {
    src.delete()
    gray.delete()
    enhanced.delete()
    binary.delete()
  }
}

function runDarkBoost(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const boosted = new cv.Mat()
  const enhanced = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.convertScaleAbs(gray, boosted, 2.2, 50)
    const clahe = new cv.CLAHE(5.0, new cv.Size(8, 8))
    clahe.apply(boosted, enhanced)
    clahe.delete()
    return {
      imageData: matToImageData(enhanced),
      steps: ['灰階化', 'convertScaleAbs(α=2.2, β=50) 線性亮度拉伸', 'CLAHE(clipLimit=5.0)'],
    }
  } finally {
    src.delete()
    gray.delete()
    boosted.delete()
    enhanced.delete()
  }
}

function runGammaCorrection(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const corrected = new cv.Mat()
  const enhanced = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    const lut = new cv.Mat(1, 256, cv.CV_8UC1)
    lut.data.set(GAMMA_LUT_DATA)
    cv.LUT(gray, lut, corrected)
    lut.delete()
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8))
    clahe.apply(corrected, enhanced)
    clahe.delete()
    return {
      imageData: matToImageData(enhanced),
      steps: ['灰階化', 'LUT Gamma 校正(γ=0.5)：暗部大幅提亮，亮部微幅壓縮', 'CLAHE(clipLimit=3.0)'],
    }
  } finally {
    src.delete()
    gray.delete()
    corrected.delete()
    enhanced.delete()
  }
}

function runHorizontalBandClahe(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const cropH = Math.floor(src.rows * 0.35)
  const cropY = Math.floor((src.rows - cropH) / 2)
  const roi = src.roi(new cv.Rect(0, cropY, src.cols, cropH))
  const upscaled = new cv.Mat()
  const gray = new cv.Mat()
  const enhanced = new cv.Mat()
  try {
    cv.resize(roi, upscaled, new cv.Size(src.cols * 2, cropH * 2), 0, 0, cv.INTER_CUBIC)
    cv.cvtColor(upscaled, gray, cv.COLOR_RGBA2GRAY)
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8))
    clahe.apply(gray, enhanced)
    clahe.delete()
    return {
      imageData: matToImageData(enhanced),
      steps: ['水平帶裁切（中央 35% 高度，全寬）', '雙三次插值放大 2x', '灰階化', 'CLAHE(clipLimit=3.0)'],
    }
  } finally {
    src.delete()
    roi.delete()
    upscaled.delete()
    gray.delete()
    enhanced.delete()
  }
}

function runDetectAndCropBarcode(imageData) {
  const cv = window.cv
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const strips = []
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    const regions = [
      { yRatio: 0.2, hRatio: 0.3, label: '上方帶 (y=20%)' },
      { yRatio: 0.35, hRatio: 0.3, label: '中央帶 (y=35%)' },
      { yRatio: 0.5, hRatio: 0.3, label: '下方帶 (y=50%)' },
    ]
    for (const region of regions) {
      const y = Math.floor(src.rows * region.yRatio)
      const h = Math.floor(src.rows * region.hRatio)
      const roi = gray.roi(new cv.Rect(0, y, src.cols, h))
      const upscaled = new cv.Mat()
      cv.resize(roi, upscaled, new cv.Size(src.cols * 2, h * 2), 0, 0, cv.INTER_CUBIC)
      const enhanced = new cv.Mat()
      const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8))
      clahe.apply(upscaled, enhanced)
      clahe.delete()
      strips.push({
        imageData: matToImageData(enhanced),
        label: region.label,
        steps: [`水平帶裁切：${region.label}`, '雙三次插值放大 2x', 'CLAHE(clipLimit=3.0)'],
      })
      roi.delete()
      upscaled.delete()
      enhanced.delete()
    }
    return strips.length > 0 ? strips : null
  } finally {
    src.delete()
    gray.delete()
  }
}

function runGradientLocalize(imageData) {
  const cv = window.cv
  if (!cv || !cv.Mat) return null
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  let contourResult = null
  let bestContour = null
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    contourResult = detectBarcodeContours(gray, { thresholdVal: 225, morphIterations: 4 })
    if (!contourResult) return null
    const contours = contourResult.contours
    let maxArea = 0
    const n = contours.size()
    for (let i = 0; i < n; i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area > maxArea) {
        maxArea = area
        if (bestContour) bestContour.delete()
        bestContour = contour
      } else {
        contour.delete()
      }
    }
    if (!bestContour) return null
    const bRect = cv.boundingRect(bestContour)
    bestContour.delete()
    bestContour = null
    const padX = Math.floor(bRect.width * 0.1)
    const padY = Math.floor(bRect.height * 0.2)
    const cropX = Math.max(0, bRect.x - padX)
    const cropY = Math.max(0, bRect.y - padY)
    const cropW = Math.min(gray.cols - cropX, bRect.width + padX * 2)
    const cropH = Math.min(gray.rows - cropY, bRect.height + padY * 2)
    if (cropW < 20 || cropH < 10) return null
    const roi = gray.roi(new cv.Rect(cropX, cropY, cropW, cropH))
    const upscaled = new cv.Mat()
    cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC)
    const enhanced = new cv.Mat()
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
    clahe.apply(upscaled, enhanced)
    clahe.delete()
    const result = matToImageData(enhanced)
    roi.delete()
    upscaled.delete()
    enhanced.delete()
    return {
      imageData: result,
      steps: [
        '灰階化',
        'Sobel 梯度分析(gradX − gradY)，突顯垂直線條',
        'GaussianBlur(9×9) → threshold(225)',
        'morphologyEx CLOSE(21×7) + erode/dilate(4×4 ×4)',
        'findContours → 最大輪廓裁切 + 邊距 10%×20%',
        '雙三次插值放大 2x',
        'CLAHE(clipLimit=2.0)',
      ],
    }
  } catch (e) {
    return null
  } finally {
    if (bestContour) bestContour.delete()
    if (contourResult) {
      contourResult.contours.delete()
      contourResult.cleanup()
    }
    src.delete()
    gray.delete()
  }
}

function runDeskewBarcode(imageData) {
  const cv = window.cv
  if (!cv || !cv.Mat) return null
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  let contourResult = null
  let bestContour = null
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    contourResult = detectBarcodeContours(gray, { thresholdVal: 225, morphIterations: 4 })
    if (!contourResult) return null
    const contours = contourResult.contours
    let maxArea = 0
    const n = contours.size()
    for (let i = 0; i < n; i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area > maxArea) {
        maxArea = area
        if (bestContour) bestContour.delete()
        bestContour = contour
      } else {
        contour.delete()
      }
    }
    if (!bestContour) return null
    const rotRect = cv.minAreaRect(bestContour)
    bestContour.delete()
    bestContour = null
    let angle = rotRect.angle
    if (rotRect.size.width < rotRect.size.height) {
      angle = angle + 90
    }
    if (Math.abs(angle) > 45) return null
    if (Math.abs(angle) < 3) return null
    const cx = rotRect.center.x
    const cy = rotRect.center.y
    const M = cv.getRotationMatrix2D(new cv.Point(cx, cy), angle, 1.0)
    const rotated = new cv.Mat()
    cv.warpAffine(gray, rotated, M, new cv.Size(gray.cols, gray.rows), cv.INTER_CUBIC, cv.BORDER_REPLICATE)
    M.delete()
    const padX = Math.floor(gray.cols * 0.05)
    const padY = Math.floor(gray.rows * 0.05)
    const cropX = Math.max(0, Math.floor(rotRect.center.x - rotRect.size.width / 2) - padX)
    const cropY = Math.max(0, Math.floor(rotRect.center.y - rotRect.size.height / 2) - padY)
    const cropW = Math.min(gray.cols - cropX, Math.ceil(rotRect.size.width) + padX * 2)
    const cropH = Math.min(gray.rows - cropY, Math.ceil(rotRect.size.height) + padY * 2)
    if (cropW < 20 || cropH < 10) {
      rotated.delete()
      return null
    }
    const roi = rotated.roi(new cv.Rect(cropX, cropY, cropW, cropH))
    const upscaled = new cv.Mat()
    cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC)
    const enhanced = new cv.Mat()
    const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8))
    clahe.apply(upscaled, enhanced)
    clahe.delete()
    const result = matToImageData(enhanced)
    roi.delete()
    rotated.delete()
    upscaled.delete()
    enhanced.delete()
    return {
      imageData: result,
      steps: [
        '灰階化',
        'Sobel 梯度分析 → 定位條碼輪廓',
        `minAreaRect → 推算歪斜角度 ${angle.toFixed(1)}°`,
        'getRotationMatrix2D + warpAffine 仿射旋轉校正',
        '裁切旋轉後條碼區域 + 邊距 5%',
        '雙三次插值放大 2x',
        'CLAHE(clipLimit=2.5)',
      ],
    }
  } catch (e) {
    return null
  } finally {
    if (bestContour) bestContour.delete()
    if (contourResult) {
      contourResult.contours.delete()
      contourResult.cleanup()
    }
    src.delete()
    gray.delete()
  }
}

// ── 策略清單（含 metadata）────────────────────────────────────────────────────

export const STRATEGIES = [
  {
    id: 'claheOnly',
    displayName: 'CLAHE 對比增強',
    environment: '光線不均勻（部分日照＋陰影混合）',
    description:
      '局部自適應直方圖均衡化（Contrast Limited AHE），將影像切成 8×8 格各自均衡，clipLimit=2.0 限制過度放大雜訊。運算量小，適合快速嘗試。',
    run: runClaheOnly,
  },
  {
    id: 'sharpenOnly',
    displayName: 'Unsharp Mask 銳化',
    environment: '相機輕微失焦 / 手持晃動模糊',
    description:
      'sharpened = gray × 1.5 − blurred × 0.5。原圖減去高斯模糊版本等於高頻細節，加回原圖即銳化邊緣。不改變整體亮度。',
    run: runSharpenOnly,
  },
  {
    id: 'centerCropClahe',
    displayName: '中央裁切 + 放大 + CLAHE',
    environment: '條碼尺寸較小 / 邊緣雜訊多',
    description:
      '裁切中央 60%×60% 去除邊緣干擾，INTER_CUBIC 雙三次插值放大 2x 提升線條像素數，再以 clipLimit=3.0 強化局部對比。',
    run: runCenterCropClahe,
  },
  {
    id: 'adaptiveThreshold',
    displayName: '自適應閾值二值化',
    environment: '光影複雜（日光燈橫向光帶、低對比）',
    description:
      'CLAHE 後套用 adaptiveThreshold，以 31×31 高斯加權計算局部閾值，C=5 避免均勻區產生雜訊。產出純黑白影像，完全消除灰階模糊。',
    run: runAdaptiveThreshold,
  },
  {
    id: 'darkBoost',
    displayName: '暗光線性增強',
    environment: '均勻低光源環境',
    description:
      'convertScaleAbs(α=2.2, β=50) 線性拉伸：每像素 = |原值 × 2.2 + 50|。後接高強度 CLAHE(5.0)。簡單粗暴但對均勻暗光效果佳；亮區可能過曝。',
    run: runDarkBoost,
  },
  {
    id: 'gammaCorrection',
    displayName: 'Gamma 校正（非線性暗光）',
    environment: '明暗混合低光源 / 逆光場景',
    description:
      'LUT Gamma 曲線(γ=0.5)：output = 255×(input/255)^0.5，暗部大幅提亮（50→113），亮部微幅壓縮（200→226），不過曝。再接 CLAHE(3.0)。',
    run: runGammaCorrection,
  },
  {
    id: 'horizontalBandClahe',
    displayName: '水平帶裁切 + 放大 + CLAHE',
    environment: '最常見手持水平掃描姿勢',
    description:
      '保留中央 35% 高度水平帶（全寬），INTER_CUBIC 放大 2x，再 CLAHE(3.0)。與 centerCropClahe 差異：保留全寬，專攻垂直方向線條清晰度。',
    run: runHorizontalBandClahe,
  },
  {
    id: 'detectAndCropBarcode',
    displayName: '多區域水平帶掃描',
    environment: '條碼垂直位置不確定（偏上/置中/偏下）',
    description:
      '對三個重疊帶（y=20%、35%、50%，各佔高度 30%）分別裁切放大 2x + CLAHE(3.0)，回傳 3 張結果。確保條碼不論在哪個位置都被涵蓋。',
    run: runDetectAndCropBarcode,
    multiResult: true,
  },
  {
    id: 'gradientLocalize',
    displayName: '梯度自動定位條碼',
    environment: '複雜背景（條碼混雜在標籤或貨架中）',
    description:
      'Sobel(gradX − gradY) 利用條碼垂直線條特徵定位，GaussianBlur + threshold + morphologyEx CLOSE 填補間隙，findContours 取最大輪廓，自動裁切後放大 + CLAHE。',
    run: runGradientLocalize,
  },
  {
    id: 'deskewBarcode',
    displayName: '歪斜校正（仿射旋轉）',
    environment: '手持掃描條碼側倒（傾斜 3°~45°）',
    description:
      '梯度定位後用 minAreaRect 推算歪斜角度，getRotationMatrix2D + warpAffine 以條碼中心為原點旋轉校正。不做全域透視變換，僅處理條碼區域，計算量小。角度 <3° 或 >45° 自動跳過。',
    run: runDeskewBarcode,
  },
]
