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