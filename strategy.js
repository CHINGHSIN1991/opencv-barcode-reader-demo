
NotebookLM 標誌
OpenCV Barcode Scanning and Image Enhancement Strategies
PRO
來源
scannerStrategies
來源指南
/**
scannerStrategies.js — 條碼掃描影像處理策略模組
本模組將所有 OpenCV 影像增強及裁切策略從主元件中抽離，
使 dlgAssetInventoryScanner.vue 專注於掃描迴圈控制邏輯。
所有策略函式均為純函式：接收 ImageData，回傳 { imageData, steps } 或 null。
依賴：window.cv（OpenCV.js）需在呼叫前載入完成。 */
// ── Canvas Pool（cropImageData 專用）───────────────────────────────────────── let cropSrcCanvas = null; let cropDstCanvas = null;
const GAMMA_LUT_DATA = (() => { const data = new Uint8Array(256); for (let i = 0; i < 256; i++) { data[i] = Math.round(255 * Math.pow(i / 255, 0.5)); } return data; })();
/**
重置 canvas pool，需在 stopScanner 時呼叫以釋放 DOM 參考。 */ export function resetCanvasPool() { cropSrcCanvas = null; cropDstCanvas = null; }
/**
裁切 ImageData 並縮放至指定尺寸。
重用內部 canvas 物件以避免每 frame 建立新 DOM 元素造成 GC 壓力。
@param {ImageData} imageData - 來源影像
@param {number} xRatio - 裁切起始 X 比例 (0~1)
@param {number} yRatio - 裁切起始 Y 比例 (0~1)
@param {number} wRatio - 裁切寬度比例 (0~1)
@param {number} hRatio - 裁切高度比例 (0~1)
@param {number} scale - 縮放倍率
@returns {ImageData} */ export function cropImageData(imageData, xRatio, yRatio, wRatio, hRatio, scale) { const sx = Math.floor(imageData.width * xRatio); const sy = Math.floor(imageData.height * yRatio); const sw = Math.floor(imageData.width * wRatio); const sh = Math.floor(imageData.height * hRatio); const dw = Math.floor(sw * scale); const dh = Math.floor(sh * scale);
// 重用 canvas 物件，避免每 frame 建立新 DOM 元素造成 GC 壓力 if (!cropSrcCanvas) { cropSrcCanvas = document.createElement('canvas'); } if (cropSrcCanvas.width !== imageData.width || cropSrcCanvas.height !== imageData.height) { cropSrcCanvas.width = imageData.width; cropSrcCanvas.height = imageData.height; } const srcCtx = cropSrcCanvas.getContext('2d'); srcCtx.putImageData(imageData, 0, 0);
if (!cropDstCanvas) { cropDstCanvas = document.createElement('canvas'); } if (cropDstCanvas.width !== dw || cropDstCanvas.height !== dh) { cropDstCanvas.width = dw; cropDstCanvas.height = dh; } const dstCtx = cropDstCanvas.getContext('2d'); dstCtx.drawImage(cropSrcCanvas, sx, sy, sw, sh, 0, 0, dw, dh);
return dstCtx.getImageData(0, 0, dw, dh); }
// ── OpenCV 工具函式 ──────────────────────────────────────────────────────────
/**
將 OpenCV Mat 轉為瀏覽器 ImageData。
自動處理灰階（單通道）→ RGBA 轉換。
@param {cv.Mat} mat - OpenCV Mat 物件
@returns {ImageData} */ function matToImageData(mat) { const cv = window.cv; const rgba = new cv.Mat(); try { if (mat.channels() === 1) { cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA); } else { mat.copyTo(rgba); } return new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows); } finally { rgba.delete(); } }
/**
梯度分析：找出最可能含有條碼的輪廓集合。
@param {cv.Mat} gray - 單通道影像，呼叫端負責釋放
@param {object} [opts]
@param {number} [opts.thresholdVal=225] - 二值化閾值
@param {number} [opts.morphIterations=4] - erode/dilate 次數
@returns {{ contours: cv.MatVector, cleanup: Function } | null} */ function detectBarcodeContours(gray, { thresholdVal = 225, morphIterations = 4 } = {}) { const cv = window.cv; const gradX = new cv.Mat(); const gradY = new cv.Mat(); const grad = new cv.Mat(); const blurred = new cv.Mat(); const thresh = new cv.Mat(); const morphed = new cv.Mat(); let contours = null; let closeKernel = null; let erodeKernel = null; let hierarchy = null;
const cleanup = () => { gradX.delete(); gradY.delete(); grad.delete(); blurred.delete(); thresh.delete(); morphed.delete(); if (closeKernel) closeKernel.delete(); if (erodeKernel) erodeKernel.delete(); if (hierarchy) hierarchy.delete(); };
try { cv.Sobel(gray, gradX, cv.CV_32F, 1, 0, 3); cv.convertScaleAbs(gradX, gradX); cv.Sobel(gray, gradY, cv.CV_32F, 0, 1, 3); cv.convertScaleAbs(gradY, gradY); cv.subtract(gradX, gradY, grad); cv.GaussianBlur(grad, blurred, new cv.Size(9, 9), 0); cv.threshold(blurred, thresh, thresholdVal, 255, cv.THRESH_BINARY);
} catch (e) { if (contours) contours.delete(); cleanup(); return null; } }
// ── [策略] claheOnly ────────────────────────────────────────────────────────── // 策略名稱：僅 CLAHE 對比增強 // 適用情境：光線不均勻（如部分日照 + 陰影），條碼整體可見但局部對比不足 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階，減少色彩干擾 // 2. CLAHE(clipLimit=2.0, tileSize=8×8)：對比度受限自適應直方圖均衡化 // - 將影像切成 8×8 格，各格獨立做直方圖均衡 // - clipLimit=2.0 限制對比增強幅度，避免雜訊被過度放大 // 特點：最簡單的 OpenCV 增強策略，運算量小，適合快速嘗試 export function strategyClaheOnly(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const gray = new cv.Mat(); const enhanced = new cv.Mat(); try { cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8)); clahe.apply(gray, enhanced); clahe.delete(); return { imageData: matToImageData(enhanced), steps: ['grayscale', 'CLAHE(2.0)'] }; } finally { src.delete(); gray.delete(); enhanced.delete(); } }
// ── [策略] sharpenOnly ───────────────────────────────────────────────────────── // 策略名稱：僅銳化（Unsharp Mask） // 適用情境：相機略微失焦或手持晃動導致影像模糊，條碼線條邊緣不夠銳利 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階 // 2. GaussianBlur(ksize=0×0, sigma=3)：產生模糊版本作為 unsharp 基底 // 3. addWeighted(src=gray×1.5, blur×(-0.5), gamma=0)： // sharpened = gray × 1.5 - blurred × 0.5 // 原理：原圖減去模糊圖 = 高頻細節，加回原圖即為銳化 // 特點：不改變整體亮度，僅強化邊緣；對已清晰影像不會造成負面影響 export function strategySharpenOnly(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const gray = new cv.Mat(); const blurred = new cv.Mat(); const sharpened = new cv.Mat(); try { cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, blurred, new cv.Size(0, 0), 3); cv.addWeighted(gray, 1.5, blurred, -0.5, 0, sharpened); return { imageData: matToImageData(sharpened), steps: ['grayscale', 'unsharp mask'] }; } finally { src.delete(); gray.delete(); blurred.delete(); sharpened.delete(); } }
// ── [策略] centerCropClahe ───────────────────────────────────────────────────── // 策略名稱：中央裁切 + 放大 + CLAHE // 適用情境：條碼位於掃描框中央但尺寸較小，或邊緣有大量雜訊干擾解碼 // 處理步驟： // 1. roi(中央 60%×60%)：裁切掉外圍 40% 雜訊區域 // 2. resize(×2, INTER_CUBIC)：雙三次插值放大 2 倍，提升條碼線條像素數 // 3. cvtColor(RGBA → GRAY)：轉灰階 // 4. CLAHE(clipLimit=3.0, tileSize=8×8)：局部對比增強 // - clipLimit=3.0（高於標準 2.0）：裁切後面積縮小，需更強的增強 // 特點：去除邊緣干擾 + 放大的組合，對小型條碼效果顯著 export function strategyCenterCropClahe(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const cropW = Math.floor(src.cols * 0.6); const cropH = Math.floor(src.rows * 0.6); const cropX = Math.floor((src.cols - cropW) / 2); const cropY = Math.floor((src.rows - cropH) / 2); const roi = src.roi(new cv.Rect(cropX, cropY, cropW, cropH)); const upscaled = new cv.Mat(); const gray = new cv.Mat(); const enhanced = new cv.Mat(); try { cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC); cv.cvtColor(upscaled, gray, cv.COLOR_RGBA2GRAY); const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8)); clahe.apply(gray, enhanced); clahe.delete(); return { imageData: matToImageData(enhanced), steps: ['center crop 60%', 'upscale 2x', 'grayscale', 'CLAHE(3.0)'] }; } finally { src.delete(); roi.delete(); upscaled.delete(); gray.delete(); enhanced.delete(); } }
// ── [策略] adaptiveThreshold ─────────────────────────────────────────────────── // 策略名稱：自適應閾值二值化 // 適用情境：光影複雜（如日光燈管造成的橫向光帶）、低對比環境 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階 // 2. CLAHE(clipLimit=2.0, tileSize=8×8)：先做局部對比增強 // 3. adaptiveThreshold(maxVal=255, method=GAUSSIAN_C, type=BINARY, // blockSize=31, C=5)： // - 以 31×31 區塊計算局部閾值（高斯加權平均） // - 像素值 > (局部均值 - 5) → 白色，否則黑色 // - blockSize=31：較大區塊容忍光照漸變 // - C=5：偏移量，避免在均勻區域產生雜訊 // 特點：產出純黑白影像，完全消除灰階模糊；但若條碼本身對比極低可能失效 export function strategyAdaptiveThreshold(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const gray = new cv.Mat(); const enhanced = new cv.Mat(); const binary = new cv.Mat(); try { cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8)); clahe.apply(gray, enhanced); clahe.delete(); cv.adaptiveThreshold(enhanced, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 5); return { imageData: matToImageData(binary), steps: ['grayscale', 'CLAHE(2.0)', 'adaptive threshold(31,5)'] }; } finally { src.delete(); gray.delete(); enhanced.delete(); binary.delete(); } }
// ── [策略] darkBoost ──────────────────────────────────────────────────────────── // 策略名稱：暗光線性增強 // 適用情境：光線不足（暗處），條碼對比度過低，其他策略無法辨識 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階 // 2. convertScaleAbs(alpha=2.2, beta=50)：線性亮度拉伸（加強版） // - 每個像素：output = |input × 2.2 + 50| // - alpha=2.2：對比增強倍數（>1 拉伸灰階範圍） // - beta=50：整體亮度偏移（>0 提亮暗部） // - 注意：線性拉伸會使已偏亮區域過曝（截斷至 255） // 3. CLAHE(clipLimit=5.0, tileSize=8×8)：高剪切值局部對比增強（加強版） // - clipLimit=5.0（標準 2.0 的 2.5 倍）：暗處需要更強的對比增強 // 特點：線性拉伸快速但粗暴，與 gammaCorrection（非線性）互補使用 export function strategyDarkBoost(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const gray = new cv.Mat(); const boosted = new cv.Mat(); const enhanced = new cv.Mat(); try { cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); // 線性亮度拉伸：alpha 為乘數（>1 提亮），beta 為偏移（>0 提亮） cv.convertScaleAbs(gray, boosted, 2.2, 50); const clahe = new cv.CLAHE(5.0, new cv.Size(8, 8)); clahe.apply(boosted, enhanced); clahe.delete(); return { imageData: matToImageData(enhanced), steps: ['grayscale', 'brightness boost (×2.2 +50)', 'CLAHE(5.0)'] }; } finally { src.delete(); gray.delete(); boosted.delete(); enhanced.delete(); } }
// ── [策略] gammaCorrection ──────────────────────────────────────────────────── // 策略名稱：Gamma 校正（非線性暗光增強） // 適用情境：低光源環境，需非線性提亮暗部同時保護亮部 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階 // 2. LUT(gamma=0.5)：建立 256 值查表，套用 Gamma 曲線 // - 公式：output = 255 × (input/255)^0.5 // - γ=0.5 < 1.0：暗部（如 50→113）大幅提亮，亮部（如 200→226）微幅變動 // - 與線性拉伸（darkBoost）的關鍵差異：非線性保護亮部不過曝 // 3. CLAHE(clipLimit=3.0, tileSize=8×8)：局部對比增強 // 特點：對明暗差距大的場景（如窗戶旁逆光）效果優於線性 darkBoost // 互補關係：darkBoost 對均勻暗光效果好；gammaCorrection 對明暗混合場景效果好 export function strategyGammaCorrection(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const gray = new cv.Mat(); const corrected = new cv.Mat(); const enhanced = new cv.Mat(); try { cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
	// Gamma LUT (γ=0.5 → 暗部大幅提亮，亮部微幅壓縮)
	const lut = new cv.Mat(1, 256, cv.CV_8UC1);
	lut.data.set(GAMMA_LUT_DATA);
	cv.LUT(gray, lut, corrected);
	lut.delete();

	const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
	clahe.apply(corrected, enhanced);
	clahe.delete();

	return { imageData: matToImageData(enhanced), steps: ['grayscale', 'gamma(0.5)', 'CLAHE(3.0)'] };
} finally {
	src.delete();
	gray.delete();
	corrected.delete();
	enhanced.delete();
}
}
// ── [策略] horizontalBandClahe ────────────────────────────────────────────────── // 策略名稱：水平帶裁切 + 放大 + CLAHE // 適用情境：條碼位於掃描框中央水平位置（最常見的手持掃描姿勢） // 處理步驟： // 1. roi(全寬, 中央高度 35%)：只保留水平帶，去除上下方雜訊 // 2. resize(×2, INTER_CUBIC)：雙三次插值放大 2 倍 // 3. cvtColor(RGBA → GRAY)：轉灰階 // 4. CLAHE(clipLimit=3.0, tileSize=8×8)：局部對比增強 // 特點： // - 與 centerCropClahe 的差異：這裡保留全寬度（不裁左右），只裁上下 // - 適合水平放置的 Code-128 條碼（寬度重要，高度其次） // - 放大效果集中在條碼高度（垂直方向），讓線條更清晰 export function strategyHorizontalBandClahe(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const cropH = Math.floor(src.rows * 0.35); const cropY = Math.floor((src.rows - cropH) / 2); const roi = src.roi(new cv.Rect(0, cropY, src.cols, cropH)); const upscaled = new cv.Mat(); const gray = new cv.Mat(); const enhanced = new cv.Mat(); try { cv.resize(roi, upscaled, new cv.Size(src.cols * 2, cropH * 2), 0, 0, cv.INTER_CUBIC); cv.cvtColor(upscaled, gray, cv.COLOR_RGBA2GRAY); const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8)); clahe.apply(gray, enhanced); clahe.delete(); return { imageData: matToImageData(enhanced), steps: ['horizontal band 35%', 'upscale 2x', 'grayscale', 'CLAHE(3.0)'] }; } finally { src.delete(); roi.delete(); upscaled.delete(); gray.delete(); enhanced.delete(); } }
// ── [策略] detectAndCropBarcode ────────────────────────────────────────────────── // 策略名稱：多區域水平帶掃描 // 適用情境：條碼在掃描框中的垂直位置不確定（偏上、置中或偏下） // 處理步驟： // 對三個重疊區域分別執行： // upper-center (y=20%, h=30%), center (y=35%, h=30%), lower-center (y=50%, h=30%) // 每個區域： // 1. roi(全寬, 指定高度)：裁切水平帶 // 2. resize(×2, INTER_CUBIC)：雙三次插值放大 // 3. CLAHE(clipLimit=3.0, tileSize=8×8)：局部對比增強 // 回傳值：回傳所有三個 strips 的陣列，由呼叫端依序嘗試解碼 // 特點： // - 三個區域有重疊（20%–50% vs 35%–65% vs 50%–80%），確保不遺漏 // - 放大有效提升小型條碼的辨識率 // - 每個 strip 獨立處理，可針對不同光照條件個別最佳化 export function strategyDetectAndCropBarcode(imageData) { const cv = window.cv; const src = cv.matFromImageData(imageData); const gray = new cv.Mat(); const strips = []; try { cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); const regions = [ { yRatio: 0.2, hRatio: 0.3, label: 'upper-center' }, { yRatio: 0.35, hRatio: 0.3, label: 'center' }, { yRatio: 0.5, hRatio: 0.3, label: 'lower-center' } ]; for (const region of regions) { const y = Math.floor(src.rows * region.yRatio); const h = Math.floor(src.rows * region.hRatio); const roi = gray.roi(new cv.Rect(0, y, src.cols, h)); const upscaled = new cv.Mat(); cv.resize(roi, upscaled, new cv.Size(src.cols * 2, h * 2), 0, 0, cv.INTER_CUBIC); const enhanced = new cv.Mat(); const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8)); clahe.apply(upscaled, enhanced); clahe.delete(); strips.push({ imageData: matToImageData(enhanced), steps: ['strip: ' + region.label, 'upscale 2x', 'CLAHE(3.0)'] }); roi.delete(); upscaled.delete(); enhanced.delete(); } // 回傳所有 strips 以便嘗試解碼每個區域，而非只回傳第一個 return strips.length > 0 ? strips : null; } finally { src.delete(); gray.delete(); } }
// ── [策略] gradientLocalize ───────────────────────────────────────────────────── // 策略名稱：梯度定位條碼區域 // 適用情境：Code-128 水平條碼混雜在複雜背景中，需自動定位條碼位置 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階 // 2. Sobel(dx=1, ksize=3) → convertScaleAbs：計算水平梯度絕對值 // 3. Sobel(dy=1, ksize=3) → convertScaleAbs：計算垂直梯度絕對值 // 4. subtract(gradX - gradY)：水平梯度減垂直梯度 // - Code-128 條碼以垂直線條（水平梯度高）為主，水平梯度遠大於垂直梯度 // - 相減後條碼區域會突出，背景被抑制 // 5. GaussianBlur(9×9) → threshold(225)：模糊後二值化，連結條碼線條間的間隙 // 6. morphologyEx(CLOSE, kernel=21×7)：閉合運算，填補條碼內部空隙 // 7. erode + dilate(4×4, iterations=4)：去除小面積雜訊 // 8. findContours → 找最大面積輪廓：定位條碼區域 // 9. boundingRect + padding(10%×20%)：輪廓外擴裁切 // 10. resize(×2, INTER_CUBIC) + CLAHE(2.0)：放大 + 對比增強 // 特點： // - 利用條碼的梯度特徵（垂直線條 → 水平梯度大）自動定位 // - 不需預知條碼位置，靠演算法自動找出 // - 裁切後只處理條碼區域，減少無關區域對解碼器的干擾 export function strategyGradientLocalize(imageData) { const cv = window.cv; if (!cv || !cv.Mat) return null;
const src = cv.matFromImageData(imageData);
const gray = new cv.Mat();
let contourResult = null;
let bestContour = null;

try {
	cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
	contourResult = detectBarcodeContours(gray, { thresholdVal: 225, morphIterations: 4 });
	if (!contourResult) return null;

	const contours = contourResult.contours;

	let maxArea = 0;
	const n = contours.size();
	for (let i = 0; i < n; i++) {
		const contour = contours.get(i);
		const area = cv.contourArea(contour);
		if (area > maxArea) {
			maxArea = area;
			if (bestContour) bestContour.delete();
			bestContour = contour;
		} else {
			contour.delete();
		}
	}

	if (!bestContour) {
		return null;
	}

	const bRect = cv.boundingRect(bestContour);
	bestContour.delete();
	bestContour = null;

	const padX = Math.floor(bRect.width * 0.1);
	const padY = Math.floor(bRect.height * 0.2);
	const cropX = Math.max(0, bRect.x - padX);
	const cropY = Math.max(0, bRect.y - padY);
	const cropW = Math.min(gray.cols - cropX, bRect.width + padX * 2);
	const cropH = Math.min(gray.rows - cropY, bRect.height + padY * 2);

	if (cropW < 20 || cropH < 10) return null;

	const roi = gray.roi(new cv.Rect(cropX, cropY, cropW, cropH));
	const upscaled = new cv.Mat();
	cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC);
	const enhanced = new cv.Mat();
	const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
	clahe.apply(upscaled, enhanced);
	clahe.delete();

	const result = matToImageData(enhanced);
	roi.delete();
	upscaled.delete();
	enhanced.delete();

	return { imageData: result, steps: ['gradient localize', 'crop+pad', 'upscale 2x', 'CLAHE(2.0)'] };
} catch (e) {
	return null;
} finally {
	if (bestContour) bestContour.delete();
	if (contourResult) {
		contourResult.contours.delete();
		contourResult.cleanup();
	}
	src.delete();
	gray.delete();
}
}
// ── [策略] deskewBarcode ───────────────────────────────────────────────────────── // 策略名稱：條碼歪斜校正（仿射旋轉） // 適用情境：手持掃描時條碼輕微側倒（< 45°），ZXing 因角度過大無法辨識 // 處理步驟： // 1. cvtColor(RGBA → GRAY)：轉灰階 // 2. 梯度分析（同 gradientLocalize）：定位條碼區域 // 3. minAreaRect：取得最小面積旋轉矩形，推算歪斜角度 // 4. getRotationMatrix2D + warpAffine：以條碼中心為原點做仿射旋轉校正 // - 角度修正遵循 OpenCV minAreaRect 的角度慣例（-90~0°） // 5. 裁切旋轉後的條碼區域（加邊距） // 6. resize(×2, INTER_CUBIC) + CLAHE(2.5)：放大 + 對比增強 // 特點： // - 不做全域透視變換，僅對定位出的條碼區域做旋轉，計算量小 // - 適合 < 45° 的側倒場景；角度過大時自動回傳 null（避免干擾） export function strategyDeskewBarcode(imageData) { const cv = window.cv; if (!cv || !cv.Mat) return null;
const src = cv.matFromImageData(imageData);
const gray = new cv.Mat();
let contourResult = null;
let bestContour = null;

try {
	cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
	contourResult = detectBarcodeContours(gray, { thresholdVal: 225, morphIterations: 4 });
	if (!contourResult) return null;

	const contours = contourResult.contours;

	let maxArea = 0;
	const n = contours.size();
	for (let i = 0; i < n; i++) {
		const contour = contours.get(i);
		const area = cv.contourArea(contour);
		if (area > maxArea) {
			maxArea = area;
			if (bestContour) bestContour.delete();
			bestContour = contour;
		} else {
			contour.delete();
		}
	}

	if (!bestContour) return null;

	// 取最小面積旋轉矩形，推算歪斜角度
	const rotRect = cv.minAreaRect(bestContour);
	bestContour.delete();
	bestContour = null;

	// OpenCV minAreaRect angle 慣例：
	//   width >= height → angle 接近 0°（水平）
	//   width < height  → angle 接近 -90°（垂直）
	// 計算需要旋轉的校正角度
	let angle = rotRect.angle;
	if (rotRect.size.width < rotRect.size.height) {
		angle = angle + 90;
	}
	// 角度超過 ±45° 表示條碼幾乎垂直或無法定位，直接跳過
	if (Math.abs(angle) > 45) return null;
	// 角度太小（< 3°）不值得旋轉，直接回傳 null 讓其他策略處理
	if (Math.abs(angle) < 3) return null;

	// 仿射旋轉校正
	const cx = rotRect.center.x;
	const cy = rotRect.center.y;
	const M = cv.getRotationMatrix2D(new cv.Point(cx, cy), angle, 1.0);
	const rotated = new cv.Mat();
	cv.warpAffine(gray, rotated, M, new cv.Size(gray.cols, gray.rows), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
	M.delete();

	// 裁切旋轉後的條碼區域（以 minAreaRect 中心與尺寸計算，加邊距）
	const padX = Math.floor(gray.cols * 0.05);
	const padY = Math.floor(gray.rows * 0.05);
	const cropX = Math.max(0, Math.round(cx - rotRect.size.width / 2) - padX);
	const cropY = Math.max(0, Math.round(cy - rotRect.size.height / 2) - padY);
	const cropW = Math.min(rotated.cols - cropX, Math.round(rotRect.size.width) + padX * 2);
	const cropH = Math.min(rotated.rows - cropY, Math.round(rotRect.size.height) + padY * 2);

	if (cropW < 20 || cropH < 10) { rotated.delete(); return null; }

	const roi = rotated.roi(new cv.Rect(cropX, cropY, cropW, cropH));
	const upscaled = new cv.Mat();
	cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC);
	const enhanced = new cv.Mat();
	const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8));
	clahe.apply(upscaled, enhanced);
	clahe.delete();

	const result = matToImageData(enhanced);
	roi.delete();
	rotated.delete();
	upscaled.delete();
	enhanced.delete();

	return { imageData: result, steps: ['deskew(' + angle.toFixed(1) + '°)', 'crop+pad', 'upscale 2x', 'CLAHE(2.5)'] };
} catch (e) {
	return null;
} finally {
	if (bestContour) bestContour.delete();
	if (contourResult) {
		contourResult.contours.delete();
		contourResult.cleanup();
	}
	src.delete();
	gray.delete();
}
}
// ── [策略] focusCenterBarcode ───────────────────────────────────────────────────── // 策略名稱：中心優先條碼聚焦 // 適用情境：掃描框內存在多條相鄰條碼（如倉架上的多件資產），一般策略易辨識到錯誤條碼 // 處理步驟： // 1. cvtColor(RGBA → GRAY) + CLAHE：前處理提高輪廓可見度 // 2. 梯度分析（水平梯度 - 垂直梯度）：偵測條碼候選區域 // 3. 形態學閉合：合併斷裂線條 // 4. findContours：找出所有候選輪廓 // 5. 過濾面積過小的輪廓（< 0.5% 影像面積），排除雜訊 // 6. 以影像中心為基準計算每個輪廓中心距離，選取最靠近的輪廓 // 7. 裁切選到的條碼區域（加邊距）+ resize(×2) + CLAHE(2.5) // 特點： // - 當框內有多個條碼時，優先取中心區域的那一個 // - 與 gradientLocalize 的差異：不取最大面積，改取最靠近中心 export function strategyFocusCenterBarcode(imageData) { const cv = window.cv; if (!cv || !cv.Mat) return null;
const src = cv.matFromImageData(imageData);
const gray = new cv.Mat();
let contourResult = null;
let bestContour = null;

try {
	cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

	// CLAHE 前處理，讓低對比條碼的梯度更清晰
	const clahe0 = new cv.CLAHE(2.0, new cv.Size(8, 8));
	const preClahe = new cv.Mat();
	clahe0.apply(gray, preClahe);
	clahe0.delete();

	contourResult = detectBarcodeContours(preClahe, { thresholdVal: 200, morphIterations: 2 });
	preClahe.delete();
	if (!contourResult) return null;

	const contours = contourResult.contours;

	const imgArea = gray.cols * gray.rows;
	const minArea = imgArea * 0.005; // 過濾掉面積 < 0.5% 的雜訊

	const imgCx = gray.cols / 2;
	const imgCy = gray.rows / 2;

	let bestDist = Infinity;
	const n = contours.size();
	for (let i = 0; i < n; i++) {
		const contour = contours.get(i);
		const area = cv.contourArea(contour);
		if (area < minArea) {
			contour.delete();
			continue;
		}
		const bRect = cv.boundingRect(contour);
		const cx = bRect.x + bRect.width / 2;
		const cy = bRect.y + bRect.height / 2;
		const dist = Math.hypot(cx - imgCx, cy - imgCy);
		if (dist < bestDist) {
			bestDist = dist;
			if (bestContour) bestContour.delete();
			bestContour = contour;
		} else {
			contour.delete();
		}
	}

	if (!bestContour) return null;

	const bRect = cv.boundingRect(bestContour);
	bestContour.delete();
	bestContour = null;

	const padX = Math.floor(bRect.width * 0.12);
	const padY = Math.floor(bRect.height * 0.25);
	const cropX = Math.max(0, bRect.x - padX);
	const cropY = Math.max(0, bRect.y - padY);
	const cropW = Math.min(gray.cols - cropX, bRect.width + padX * 2);
	const cropH = Math.min(gray.rows - cropY, bRect.height + padY * 2);

	if (cropW < 20 || cropH < 10) return null;

	const roi = gray.roi(new cv.Rect(cropX, cropY, cropW, cropH));
	const upscaled = new cv.Mat();
	cv.resize(roi, upscaled, new cv.Size(cropW * 2, cropH * 2), 0, 0, cv.INTER_CUBIC);
	const enhanced = new cv.Mat();
	const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8));
	clahe.apply(upscaled, enhanced);
	clahe.delete();

	const result = matToImageData(enhanced);
	roi.delete();
	upscaled.delete();
	enhanced.delete();

	return { imageData: result, steps: ['focusCenter', 'crop+pad', 'upscale 2x', 'CLAHE(2.5)'] };
} catch (e) {
	return null;
} finally {
	if (bestContour) bestContour.delete();
	if (contourResult) {
		contourResult.contours.delete();
		contourResult.cleanup();
	}
	src.delete();
	gray.delete();
}
}
// ── [複合策略] lowLightBoost ──────────────────────────────────────────────────── // darkBoost → gammaCorrection：線性提亮 + 非線性 Gamma 校正 // 適用情境：低光源均勻暗場景，雙重補光讓條碼線條可見 export function strategyLowLightBoost(imageData) { const boosted = strategyDarkBoost(imageData); if (!boosted || !boosted.imageData) return null; return strategyGammaCorrection(boosted.imageData); }
// ── [複合策略] darkGradient ───────────────────────────────────────────────────── // darkBoost → gradientLocalize：先暗光提亮，再梯度定位條碼區域 // 適用情境：低光源 + 複雜背景，條碼難以直接定位 export function strategyDarkGradient(imageData) { const boosted = strategyDarkBoost(imageData); if (!boosted || !boosted.imageData) return null; return strategyGradientLocalize(boosted.imageData); }
// ── [複合策略] darkHorizontalBand ─────────────────────────────────────────────── // darkBoost → horizontalBandClahe：先暗光提亮，再水平帶裁切增強 // 適用情境：低光源 + 條碼位於掃描框中央水平位置 export function strategyDarkHorizontalBand(imageData) { const boosted = strategyDarkBoost(imageData); if (!boosted || !boosted.imageData) return null; return strategyHorizontalBandClahe(boosted.imageData); }
對話
🔍
OpenCV Barcode Scanning and Image Enhancement Strategies
6 個來源
·
2026年5月4日
這些原始碼與技術文件詳細說明了 dlgAssetInventoryScanner.vue 條碼掃描器的核心架構，該系統主要用於資產盤點。其辨識流程整合了 OpenCV.js、ZXing 與原生 BarcodeDetector API，建構出四層式的掃描迴圈以確保在不同環境下都能精準解碼。系統具備智慧閃光燈控制與多種影像增強策略，能有效處理低光源、標籤歪斜或遠距離模糊等極端情境。此外，文件也規範了嚴格的條碼驗證管線與非同步提交機制，藉此排除格式錯誤並提升數據上傳的穩定性。總體而言，這是一套結合電腦視覺與硬體加速技術的高效能網頁端掃描解決方案。

此掃描器如何透過 OpenCV 策略處理低光源環境？
請解釋掃描迴圈的四層解碼機制與優先順序。
系統如何驗證掃描結果以確保資產編號格式正確？
5月4日 星期一
請介紹這份模組中不同的條碼增強策略及其適用情境。

這份模組（scannerStrategies.js）將 OpenCV 影像增強與裁切策略從主程式中抽離出來，並針對不同的掃描環境與光線條件提供了多種策略
。以下為這些策略的分類與適用情境：
基礎影像增強策略
strategyClaheOnly（僅 CLAHE 對比增強）： 適用於**光線不均勻（如部分日照加上陰影）**的情境，此時條碼整體可見，但局部對比不足
。
strategySharpenOnly（僅銳化）： 適用於相機略微失焦或手持晃動導致影像模糊，使得條碼線條邊緣不夠銳利的情境
。
strategyAdaptiveThreshold（自適應閾值二值化）： 適用於**光影複雜（例如日光燈管造成的橫向光帶）**或低對比環境，透過局部閾值運算可消除灰階模糊
。
裁切與位置定位策略
strategyCenterCropClahe（中央裁切 + 放大 + CLAHE）： 適用於條碼位於掃描框中央但尺寸較小，或是邊緣有大量雜訊干擾解碼的情境
。
strategyHorizontalBandClahe（水平帶裁切 + 放大 + CLAHE）： 適用於條碼位於掃描框中央水平位置，這是最常見的手持掃描姿勢
。
strategyDetectAndCropBarcode（多區域水平帶掃描）： 適用於條碼在掃描框中的垂直位置不確定（偏上、置中或偏下）的情境，會對上、中、下三個重疊的水平區域分別進行處理與辨識
。
進階特徵與輪廓定位策略
strategyGradientLocalize（梯度定位條碼區域）： 適用於條碼混雜在複雜背景中，需利用條碼的梯度特徵（垂直線條）自動定位出最大面積輪廓的情境
。
strategyFocusCenterBarcode（中心優先條碼聚焦）： 適用於掃描框內存在多條相鄰條碼（例如倉架上的多件資產），此策略會優先擷取最靠近影像中心的輪廓，避免辨識到錯誤條碼
。
strategyDeskewBarcode（條碼歪斜校正）： 適用於手持掃描時條碼有輕微側倒（3°至 45° 的歪斜），導致解碼器因角度過大無法辨識的情境，會對定位出的條碼區域進行仿射旋轉校正
。
低光源與複合策略 針對光線不足的場景，模組提供了基礎的暗光處理以及衍生出的複合策略：
strategyDarkBoost（暗光線性增強）： 適用於均勻的暗光環境，透過線性亮度拉伸快速提亮，使過低的條碼對比度得以提升
。
strategyGammaCorrection（Gamma 校正）： 適用於**低光源且明暗差距大（如窗戶旁逆光）**的場景，能以非線性方式大幅提亮暗部，同時保護亮部不過曝
。
strategyLowLightBoost（雙重補光）： 結合了 DarkBoost 與 GammaCorrection，適用於低光源均勻暗場景或明暗混合場景，透過雙重補光讓條碼線條變得可見
。
strategyDarkGradient： 先進行暗光提亮，再利用梯度定位，適用於低光源加上背景複雜，導致條碼難以直接定位的情境
。
strategyDarkHorizontalBand： 先進行暗光提亮，再配合水平帶裁切增強，適用於低光源環境且條碼恰好位於掃描框中央水平位置的情境
。
今天 • 下午3:10
請幫我整理整個流程及各個步驟負責的 packages

一、 初始化階段
1. 解碼器初始化 (Decoder Initialization)：相機串流開啟前，系統會優先初始化瀏覽器原生的 BarcodeDetector Web API（僅限 Chromium 系瀏覽器支援）。若無法使用，則作為備援方案初始化 @zxing/library 套件中的 MultiFormatReader
。
2. 相機與畫布初始化 (Camera Setup)：透過 WebRTC 的 getUserMedia API 開啟相機串流，並嘗試套用連續自動對焦、閃光燈（Torch）與連續自動曝光等設定
。同時會建立與影像尺寸相同的 Canvas 畫布，用於後續逐幀擷取影像
。
3. OpenCV 暖機 (OpenCV Warm-up)：在不阻擋主掃描迴圈的情況下，非同步載入 opencv-4.12.0.js。此步驟會載入特定編譯版本以包含 barcode 模組，並建立 cv.barcode_BarcodeDetector
。
二、 掃描迴圈階段 (Scanning Loop)
掃描迴圈透過 requestAnimationFrame 每幀執行，採用分層策略，任一層成功解碼即跳過後續層次
。
層一：Video 直接解碼 (Fastest Path)：直接從 <video> 元素讀取畫面，交由硬體加速的原生 BarcodeDetector API 進行解碼，速度最快且支援透視修正
。
層二：Canvas 原始影像解碼：將影片繪入 Offscreen Canvas 並透過 Canvas API 裁切出掃描框的 ImageData。影像不經前置處理，直接交由 BarcodeDetector API 或備援的 @zxing/library 解碼
。
層二·五：OpenCV 內建解碼：將原始 ImageData 送入 opencv-4.12.0.js 的 cv.barcode_BarcodeDetector 中，利用其內建的梯度分析定位與解碼功能
。
層三：Canvas 裁切輪替 (Round-robin)：依據幀數輪替 4 種不同的裁切與縮放比例（如置中裁切、水平帶裁切、縮放等）。此步驟由自訂模組 scannerStrategies.js 負責影像的裁切計算與 Canvas 重用，裁切後的影像再交由 BarcodeDetector API 與 @zxing/library 解碼
。
層四：OpenCV 影像增強輪替 (Round-robin)：依據當下是否為低光源場景，切換不同的 OpenCV 前處理策略（包含 9 種正常光源策略或 6 種低光源策略）。此步驟由 scannerStrategies.js 調用 opencv-4.12.0.js 執行灰階、自適應閾值、CLAHE 對比增強、Sobel 梯度定位或仿射旋轉等複雜運算，處理後的影像最終交回給 BarcodeDetector API 與 @zxing/library 解碼
。
三、 驗證與提交階段
1. 解碼驗證管線 (Validation Pipeline)：由主程式內的自訂邏輯處理。cleanBarcodeText() 負責利用正規表達式剝除 Code-128 控制字元與 ASCII 不可見字元，隨後 isValidBarcode() 透過四道規則（長度、是否含特定字元等）驗證資產編號格式
。
2. 提交結果 (Submit Queue)：驗證通過後，藉由 AJAX API 將資料送至後端 scripts/assetInventory.php，寫入盤點紀錄並回傳狀態
。

--------------------------------------------------------------------------------
核心 Packages 與 APIs 總覽
前端框架與基礎套件：使用 vue 負責元件生命週期與狀態管理，並匯入 dayjs 處理時間格式
。
條碼解碼核心：
BarcodeDetector Web API：瀏覽器原生支援的最快解碼路徑
。
@zxing/library：作為原生 API 的強力備援，負責跨平台的軟體解碼
。
影像處理引擎：
opencv-4.12.0.js：負責高階影像前處理（如 CLAHE、梯度運算、Gamma 校正）與部分備援解碼
。
Canvas API (HTML5)：負責中介的影像繪製、裁切與像素轉換
。
策略封裝模組：自定義模組 scannerStrategies.js，將 OpenCV 複雜演算法與 Canvas 記憶體管理 (Canvas Pool) 從主程式中抽離
。
目前程式碼內有使用 opencv 解析 barcode 嗎

是的，目前的程式碼中確實有使用 OpenCV 來進行條碼的解析與解碼
。
在掃描迴圈（Scan Loop）的分層設計中，OpenCV 解碼被安排在**「層二·五」（Level 2.5）**的執行階段，具體細節如下：
專屬模組與 API： 程式碼使用了 cv.barcode_BarcodeDetector 來執行解碼
。因為標準版的 OpenCV.js 預設並沒有內建此模組，所以程式碼在背景暖機載入 opencv-4.12.0.js 時，是使用了一個包含 barcode 模組的特定編譯版本
。
解碼特性： OpenCV 的條碼解碼器結合了梯度分析定位與內建解碼功能，且其特點是「不需依賴 DNN（深度神經網路）模型」即可進行同步解碼
。
負責函式： 系統中定義了 decodeWithCvBarcode() 函式，專門負責將擷取到的 ImageData 送入 OpenCV 引擎進行解析
。
結果驗證： 由 OpenCV 成功解析出的條碼文字，與其他解碼器（原生 BarcodeDetector 或 ZXing）的結果相同，都必須統一通過後續的解碼驗證管線（包含 cleanBarcodeText() 清除隱藏字元，以及 isValidBarcode() 的長度與格式規則驗證），才會被系統判定為有效的盤點條碼
。
總結來說，OpenCV 在這份專案中扮演著雙重角色：它不僅在「層四」負責強大的影像前處理與特徵增強，同時也在「層二·五」直接作為輔助的解碼引擎參與辨識
。
具體的程式碼是甚麼

根據提供的來源資料，主程式 dlgAssetInventoryScanner.vue 內部關於 decodeWithCvBarcode() 的具體原始程式碼並未完整包含在文本中（文本主要提供了 scannerStrategies.js 的影像增強策略碼，以及主程式的運作流程文件）
。
不過，綜合來源中的「架構流程說明」以及 OpenCV 官方條碼掃描器的「實作指南」，我們可以得知該功能具體的程式碼運作邏輯與 API 呼叫方式如下：
1. 初始化解碼器 (warmupOpenCV) 程式會在不阻擋掃描迴圈的情況下，於背景動態載入 OpenCV.js 並建立解碼器實體：
指定載入含有 barcode 模組的 /ui/js/opencv-4.12.0.js 路徑
。
輪詢檢查 window.cv.Mat 是否就緒（最長等候 30 秒）
。
成功後初始化 cv.barcode_BarcodeDetector。如果在舊版（如 4.5.3 以前）或未包含該模組的版本中執行，會出現 cv.barcode_BarcodeDetector is not a constructor 的錯誤
。
2. 執行解析 (decodeWithCvBarcode) 在「層二·五」被觸發時，該函式會接收從掃描框擷取下來的 ImageData 進行「同步解碼」
。根據 OpenCV 的 API 設計，解碼過程包含兩個核心方法：
定位 (detect)：先使用 detect 函式，利用底層的梯度分析自動找出影像中條碼的邊界位置
。
解碼 (decode)：取得位置後，再調用 decode 函式將該區域的條碼內容讀取出來（目前 OpenCV 原生支援 EAN-13、EAN-8 與 UPC-A 等 1D 條碼格式）
。
3. 結果清理與驗證 當 OpenCV 成功回傳解析文字後，系統會套用具體的正規表達式與邏輯進行過濾：
透過 cleanBarcodeText() 函式，利用正規表達式（/\s*(?:Start\s*[ABC]|Stop|FNC\s*
|Code\s*[ABC]|Shift|DE?L|NUL.../i）清除 Code-128 的控制字元與 ASCII 不可見字元
。
通過 isValidBarcode() 進行 4 道驗證：確保字串長度 ≥ 3、不全為 ?、不含 ?，且必須包含 - 字元，以此排除純數字等誤判情形
。
（註：以上流程與 API 操作是由來源中的架構文件與教學文章反推整理而成。若您需要該 Vue 元件實際的程式碼片段，可能需要檢視未包含在此次來源中的 dlgAssetInventoryScanner.vue 完整檔案內容。）
在舊的策略中總共有哪些辨識策略，分別使用 openCV 的哪些作用

根據 2026-04-24 版本的舊有設計文件，當時的掃描策略被劃分為**「固定策略」與「9 種輪替（Round-Robin）策略」**。以下為舊版策略清單及其對應的 OpenCV 作用：
一、固定策略（每幀必定執行） 在舊版中，為了應對實務上最常見的標籤傾斜或透視失真，有一項獨立的固定策略：
strategyLabelIsolate（標籤獨立與透視校正）
OpenCV 作用：首先使用自適應的 Canny 函式進行邊緣偵測，接著用 minAreaRect 取出最小面積的旋轉矩形以推算傾斜角，再利用 warpPerspective 執行透視變換（仿射校正），最後套用 CLAHE 增強對比度，將歪斜的標籤校正為正視圖
。(註：此策略在後續版本已遭移除
)
二、Round-Robin 策略（9 種策略依序輪替） 除了固定策略外，系統會依據幀數（frameCount % 9）輪流執行下列 9 種增強策略：
strategyGradientLocalize（Sobel 梯度定位）：適用於複雜背景
。
OpenCV 作用：影像轉灰階後，計算 Sobel 的 X 與 Y 軸梯度，將水平梯度減去垂直梯度（以突顯條碼特徵）。後續經過 GaussianBlur（模糊化）、threshold（二值化），以及形態學的閉合（morphologyEx）、侵蝕膨脹（erode/dilate）來找尋最大輪廓並裁切，最後放大並套用 CLAHE 增強
。
strategyDetectAndCropBarcode（多區域水平帶掃描）：適用於條碼垂直位置不確定時
。
OpenCV 作用：將影像轉灰階後，分別對上（20%）、中（35%）、下（50%）三個不同水平區域進行裁切，將這些區域放大 2 倍後，分別套用 CLAHE 進行局部對比增強
。
strategyClaheOnly（僅 CLAHE 對比增強）：適用於光線不均勻的場景
。
OpenCV 作用：單純將影像轉灰階後，套用 CLAHE（設定 clipLimit=2.0，切分 8×8 區塊）做基礎的自適應直方圖均衡化
。
strategySharpenOnly（Unsharp Mask 銳化）：適用於輕微失焦或晃動模糊
。
OpenCV 作用：影像轉灰階後，先用 GaussianBlur 產生模糊版本的基底圖，再運用 addWeighted 將原灰階圖與模糊圖以「1.5 比 -0.5」的權重相加，藉此提取高頻細節達到邊緣銳化效果
。
strategyCenterCropClahe（中央裁切+放大）：適用於條碼較小且周邊雜訊多的狀況
。
OpenCV 作用：取中央 60% 區域裁切，接著以雙三次插值（INTER_CUBIC）放大 2 倍，並在轉為灰階後搭配較強的 CLAHE (3.0)
。
strategyAdaptiveThreshold（CLAHE+自適應閾值）：適用於光影複雜（如橫向光帶）的環境
。
OpenCV 作用：轉灰階並套用 CLAHE 後，利用 adaptiveThreshold 進行自適應閾值二值化（高斯加權，31×31 區塊大小計算局部平均），將灰階徹底轉換為乾淨的黑白影像
。
strategyDarkBoost（線性亮度拉伸）：適用於均勻暗光的環境
。
OpenCV 作用：轉灰階後，使用 convertScaleAbs 乘上提亮係數（如 α=1.8 或 2.2，並加上亮度偏移）進行線性亮度拉伸，最後搭配高強度的 CLAHE (4.0 或 5.0)
。
strategyHorizontalBandClahe（水平帶裁切+放大）：應對最常見的手持水平掃描位置
。
OpenCV 作用：保留影像中央 35% 高度的水平帶，同樣以 INTER_CUBIC 放大 2 倍並轉灰階後，套用 CLAHE 增強
。
strategyGammaCorrection（Gamma 非線性提亮）：適用於明暗混合低光源（如逆光環境）
。
OpenCV 作用：轉灰階後，建立並套用非線性的 Gamma 查表（LUT，γ=0.5）來大幅提亮暗部、同時保護亮部不過曝，最後再加上 CLAHE 補強對比
。
為什麼舊版中的 strategyLabelIsolate 被移除了？

舊版（2026-04-24 紀錄）中的 strategyLabelIsolate 策略已於 2026-04-28 版本之前被移除
。根據系統架構的演進與文件說明，該策略被移除並替換的原因主要包含以下幾點考量：
原生解碼器已支援透視修正：系統最優先的解碼路徑（層一）是直接從 <video> 元素讀取畫面，交由瀏覽器原生 BarcodeDetector API 進行解碼，該 API 具有硬體加速優勢，且本身就已經支援透視修正功能
。
減輕每幀的運算效能負擔：在舊版設計中，strategyLabelIsolate 是唯一一個「固定策略」，這代表程式在每一個 frame 都必須執行包含自適應 Canny 邊緣偵測與 warpPerspective（全域透視變換）在內的複雜影像處理
。這種每幀必定執行的全域變換對系統效能消耗較大。
被更輕量的局部旋轉策略（strategyDeskewBarcode）取代：為了解決手持掃描時條碼輕微側倒的情境，新版本引入了 strategyDeskewBarcode 策略，並將其改為 9 種正常光源的輪替（Round-Robin）策略之一，不再每幀強制執行
。新策略改進了做法，會先利用梯度定位出條碼區域，接著只對該區域使用 warpAffine 進行仿射旋轉校正（針對 3° 到 45° 的歪斜）
。文件特別標明新做法的優勢在於「不做全域透視變換，僅對定位出的條碼區域做旋轉，計算量小」
。
總結來說，strategyLabelIsolate 是因為效能過於耗費，且其全域透視修正的功能已經被底層的原生 API 以及更有效率的局部仿射校正策略（strategyDeskewBarcode）所涵蓋與取代，因而被移出主流程。
開始輸入...
6 個來源
工作室
🎉
試用新的心智圖自訂功能！
語音摘要
簡報
影片摘要
心智圖
報告
學習卡
測驗
資訊圖表
資料表
Intelligent Optical Engine
5 個來源 · 6 小時前
資產盤點 掃描器
5 個來源 · 6 小時前
NotebookLM 提供的資訊未必正確，請查證回覆內容。
