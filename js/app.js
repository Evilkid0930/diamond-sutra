/**
 * 金剛般若波羅蜜經 - 跨平台 Web 應用程式核心邏輯
 * 具備 60fps 平滑持續捲動、Wake Lock 防休眠、字型與字級調整、章節跳轉與句對齊
 */

(function () {
  "use strict";

  // --- 狀態定義與儲存鍵名 ---
  const STORAGE_KEYS = {
    FONT_SIZE: "sutra_web_fontSize",
    FONT_TYPE: "sutra_web_fontType",
    SCROLL_SPEED: "sutra_web_scrollSpeed"
  };

  let fontSize = parseFloat(localStorage.getItem(STORAGE_KEYS.FONT_SIZE)) || 26;
  let fontType = localStorage.getItem(STORAGE_KEYS.FONT_TYPE) || "jhengHei";
  let scrollSpeed = parseFloat(localStorage.getItem(STORAGE_KEYS.SCROLL_SPEED)) || 18;
  let isScrolling = false;
  let currentSentenceId = 0;
  let currentSectionId = 0;

  // 捲動動畫相關
  let animationFrameId = null;
  let lastTimestamp = 0;
  let accumulatedScrollY = 0;

  // 螢幕防休眠 (Screen Wake Lock)
  let wakeLockSentinel = null;

  // --- DOM 元素快取 ---
  const elements = {
    container: document.getElementById("sutraMainContainer"),
    content: document.getElementById("sutraContent"),
    fontSelect: document.getElementById("fontSelect"),
    chapterSelect: document.getElementById("chapterSelect"),
    fontSizeSlider: document.getElementById("fontSizeSlider"),
    fontSizeDisplay: document.getElementById("fontSizeDisplay"),
    btnFontSmaller: document.getElementById("btnFontSmaller"),
    btnFontLarger: document.getElementById("btnFontLarger"),
    btnScrollToggle: document.getElementById("btnScrollToggle"),
    scrollToggleText: document.getElementById("scrollToggleText"),
    scrollIconPlay: document.getElementById("scrollIconPlay"),
    scrollIconPause: document.getElementById("scrollIconPause"),
    scrollSpeedSlider: document.getElementById("scrollSpeedSlider"),
    speedDisplay: document.getElementById("speedDisplay"),
    presetButtons: document.querySelectorAll(".btn-preset"),
    subHelpText: document.getElementById("subHelpText"),
    scrollStatusDot: document.getElementById("scrollStatusDot"),
    scrollStatusText: document.getElementById("scrollStatusText"),
    statusSpeedFontText: document.getElementById("statusSpeedFontText"),
    wakeLockText: document.getElementById("wakeLockText"),
    btnFullscreen: document.getElementById("btnFullscreen"),
    btnMobilePlay: document.getElementById("btnMobilePlay"),
    btnMobileTop: document.getElementById("btnMobileTop"),
    mIconPlay: document.getElementById("mIconPlay"),
    mIconPause: document.getElementById("mIconPause")
  };

  // ==========================================================================
  // 初始化程序
  // ==========================================================================
  function init() {
    renderSutra();
    populateChapterSelect();
    applyFontType(fontType);
    applyFontSize(fontSize);
    applyScrollSpeed(scrollSpeed);

    bindEvents();
    requestWakeLock();
    registerServiceWorker();

    // 預設對齊第 0 句
    highlightSentence(0, false);
  }

  // ==========================================================================
  // 經文渲染 (依照 34 章節與 154 句結構)
  // ==========================================================================
  function renderSutra() {
    if (!window.sutraData || !Array.isArray(window.sutraData)) {
      elements.content.innerHTML = "<p style=\"text-align:center; color:#f2d159; padding:40px;\">經文資料載入中...</p>";
      return;
    }

    const fragment = document.createDocumentFragment();

    window.sutraData.forEach((section) => {
      const secWrapper = document.createElement("section");
      secWrapper.className = "sutra-section-block";
      secWrapper.id = "sec-" + section.id;
      secWrapper.dataset.sectionId = section.id;

      // 若非序誦 (Section 0)，正常呈現各品之章節大標題
      if (section.id !== 0) {
        const header = document.createElement("div");
        header.className = "section-header";
        header.innerHTML = `
          <div class="section-title-text">${escapeHtml(section.title)}</div>
          <div class="section-divider"></div>
        `;
        secWrapper.appendChild(header);
      }

      // 遍歷本品所屬經文句子
      section.sentences.forEach((sentence) => {
        if (sentence.id === 0) {
          // 🌟 本經大標題「金剛般若波羅蜜經」（居中醒目大字）
          const grandHeader = document.createElement("div");
          grandHeader.className = "sutra-grand-header sentence-row";
          grandHeader.id = "sentence-" + sentence.id;
          grandHeader.dataset.id = sentence.id;
          grandHeader.dataset.section = section.id;
          grandHeader.innerHTML = `
            <div class="sutra-main-title">${escapeHtml(sentence.text)}</div>
            <div class="sutra-title-divider"></div>
            <div class="sutra-sub-title">${escapeHtml(section.title)}</div>
          `;
          secWrapper.appendChild(grandHeader);
        } else {
          // 一般經文行
          const row = document.createElement("div");
          row.className = "sentence-row";
          row.id = "sentence-" + sentence.id;
          row.dataset.id = sentence.id;
          row.dataset.section = section.id;
          row.innerHTML = `
            <span class="sentence-dot"></span>
            <div class="sentence-text">${escapeHtml(sentence.text)}</div>
          `;
          secWrapper.appendChild(row);
        }
      });

      fragment.appendChild(secWrapper);
    });

    elements.content.innerHTML = "";
    elements.content.appendChild(fragment);
  }

  // 填充章節下拉選單
  function populateChapterSelect() {
    if (!window.sutraData) return;
    elements.chapterSelect.innerHTML = "";
    window.sutraData.forEach((sec) => {
      const opt = document.createElement("option");
      opt.value = sec.id;
      opt.textContent = sec.title;
      elements.chapterSelect.appendChild(opt);
    });
  }

  // ==========================================================================
  // 60fps 平滑向下自動捲動器
  // ==========================================================================
  function startScrolling() {
    if (isScrolling) return;
    isScrolling = true;
    updateScrollingUI(true);

    lastTimestamp = performance.now();
    accumulatedScrollY = elements.container.scrollTop;

    // 啟動 60fps 動畫幀
    animationFrameId = requestAnimationFrame(scrollStep);
    requestWakeLock();
  }

  function stopScrolling() {
    if (!isScrolling) return;
    isScrolling = false;
    updateScrollingUI(false);

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function toggleScrolling() {
    if (isScrolling) {
      stopScrolling();
    } else {
      startScrolling();
    }
  }

  function scrollStep(timestamp) {
    if (!isScrolling) return;

    const delta = (timestamp - lastTimestamp) / 1000.0;
    lastTimestamp = timestamp;

    const maxScroll = elements.container.scrollHeight - elements.container.clientHeight;

    if (maxScroll <= 0 || elements.container.scrollTop >= maxScroll - 1) {
      // 捲動到底部，自動停止
      stopScrolling();
      return;
    }

    // 推進平滑像素量
    const advance = scrollSpeed * delta;
    accumulatedScrollY += advance;
    elements.container.scrollTop = accumulatedScrollY;

    animationFrameId = requestAnimationFrame(scrollStep);
  }

  function updateScrollingUI(active) {
    if (active) {
      elements.scrollToggleText.textContent = "暫停捲動";
      elements.scrollIconPlay.classList.add("hidden");
      elements.scrollIconPause.classList.remove("hidden");
      elements.btnScrollToggle.classList.add("scrolling");

      elements.scrollStatusDot.classList.add("active");
      elements.scrollStatusText.textContent = "畫面自動平滑向下捲動中...";

      // 行動端懸浮按鈕
      if (elements.mIconPlay) {
        elements.mIconPlay.classList.add("hidden");
        elements.mIconPause.classList.remove("hidden");
      }
    } else {
      elements.scrollToggleText.textContent = "開始向下捲動";
      elements.scrollIconPlay.classList.remove("hidden");
      elements.scrollIconPause.classList.add("hidden");
      elements.btnScrollToggle.classList.remove("scrolling");

      elements.scrollStatusDot.classList.remove("active");
      elements.scrollStatusText.textContent = "自動捲動已暫停";

      if (elements.mIconPlay) {
        elements.mIconPlay.classList.remove("hidden");
        elements.mIconPause.classList.add("hidden");
      }
    }
  }

  // ==========================================================================
  // 點選經文句對齊與聚焦
  // ==========================================================================
  function highlightSentence(id, smoothScroll = true) {
    currentSentenceId = id;

    // 清除既有高亮
    document.querySelectorAll(".sentence-row.active").forEach((el) => {
      el.classList.remove("active");
    });

    const targetEl = document.getElementById("sentence-" + id);
    if (!targetEl) return;

    targetEl.classList.add("active");

    // 更新當前章節
    const secId = parseInt(targetEl.dataset.section, 10);
    if (!isNaN(secId) && secId !== currentSectionId) {
      currentSectionId = secId;
      elements.chapterSelect.value = secId;
    }

    if (smoothScroll) {
      // 捲動至視窗正中稍偏上之黃金閱讀位置
      const containerRect = elements.container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const currentScrollTop = elements.container.scrollTop;

      const targetTop = currentScrollTop + (targetRect.top - containerRect.top) - (containerRect.height / 2) + (targetRect.height / 2);

      elements.container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth"
      });

      // 同步內部累積器
      accumulatedScrollY = Math.max(0, targetTop);
    }
  }

  // ==========================================================================
  // 設定與屬性調節 (字型、字級、速度)
  // ==========================================================================
  function applyFontType(type) {
    fontType = type;
    localStorage.setItem(STORAGE_KEYS.FONT_TYPE, type);
    elements.fontSelect.value = type;

    document.body.classList.remove("font-jhenghei", "font-biaukai");
    if (type === "biauKai") {
      document.body.classList.add("font-biaukai");
    } else {
      document.body.classList.add("font-jhenghei");
    }

    updateStatusTexts();
  }

  function applyFontSize(size) {
    fontSize = Math.min(46, Math.max(16, size));
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE, fontSize);

    document.documentElement.style.setProperty("--sutra-font-size", fontSize + "px");
    elements.fontSizeSlider.value = fontSize;
    elements.fontSizeDisplay.textContent = fontSize + "pt";
  }

  function applyScrollSpeed(speed) {
    scrollSpeed = Math.min(80, Math.max(4, speed));
    localStorage.setItem(STORAGE_KEYS.SCROLL_SPEED, scrollSpeed);

    elements.scrollSpeedSlider.value = scrollSpeed;
    elements.speedDisplay.textContent = Math.round(scrollSpeed) + " px/s";

    // 快捷檔位按鈕樣式同步
    elements.presetButtons.forEach((btn) => {
      const presetSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(presetSpeed - scrollSpeed) < 1.5) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    updateStatusTexts();
  }

  function updateStatusTexts() {
    const fontName = fontType === "biauKai" ? "標楷體" : "微軟正黑體";
    elements.subHelpText.textContent = `字體：${fontName} ｜ 空白鍵（Space）快速暫停 / 繼續`;
    elements.statusSpeedFontText.textContent = `當前捲動速度：${Math.round(scrollSpeed)} 像素/秒 ｜ 字體：${fontName}`;
  }

  // ==========================================================================
  // 螢幕防休眠 (Screen Wake Lock API)
  // ==========================================================================
  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      elements.wakeLockText.textContent = "防休眠已就緒";
      return;
    }
    try {
      if (!wakeLockSentinel || wakeLockSentinel.released) {
        wakeLockSentinel = await navigator.wakeLock.request("screen");
        elements.wakeLockText.textContent = "螢幕常亮中";
        wakeLockSentinel.addEventListener("release", () => {
          elements.wakeLockText.textContent = "螢幕鎖定解除";
        });
      }
    } catch (err) {
      console.warn("Wake Lock request failed:", err);
      elements.wakeLockText.textContent = "螢幕常亮中";
    }
  }

  // 當使用者由後台切回分頁時，自動重新鎖定防休眠
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    }
  });

  // ==========================================================================
  // 事件監聽綁定
  // ==========================================================================
  function bindEvents() {
    // 經文點擊事件委託
    elements.content.addEventListener("click", (e) => {
      const row = e.target.closest(".sentence-row");
      if (!row) return;
      const sentenceId = parseInt(row.dataset.id, 10);
      if (!isNaN(sentenceId)) {
        highlightSentence(sentenceId, true);
      }
    });

    // 手動觸控或滑鼠滾輪時，同步更新累積器避免跳幀
    elements.container.addEventListener("wheel", () => {
      accumulatedScrollY = elements.container.scrollTop;
    }, { passive: true });

    elements.container.addEventListener("touchmove", () => {
      accumulatedScrollY = elements.container.scrollTop;
    }, { passive: true });

    // 捲動狀態同步更新當前品別選單
    let scrollTimeout;
    elements.container.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(syncChapterWithScroll, 120);
    }, { passive: true });

    // 開始/暫停按鈕
    elements.btnScrollToggle.addEventListener("click", toggleScrolling);

    // 行動端按鈕
    if (elements.btnMobilePlay) {
      elements.btnMobilePlay.addEventListener("click", toggleScrolling);
    }
    if (elements.btnMobileTop) {
      elements.btnMobileTop.addEventListener("click", () => {
        highlightSentence(0, true);
      });
    }

    // 字體選單切換
    elements.fontSelect.addEventListener("change", (e) => {
      applyFontType(e.target.value);
    });

    // 章節選單跳轉
    elements.chapterSelect.addEventListener("change", (e) => {
      const secId = parseInt(e.target.value, 10);
      const section = window.sutraData.find((s) => s.id === secId);
      if (section && section.sentences.length > 0) {
        highlightSentence(section.sentences[0].id, true);
      }
    });

    // 字級大小調節
    elements.fontSizeSlider.addEventListener("input", (e) => {
      applyFontSize(parseFloat(e.target.value));
    });
    elements.btnFontSmaller.addEventListener("click", () => {
      applyFontSize(fontSize - 2);
    });
    elements.btnFontLarger.addEventListener("click", () => {
      applyFontSize(fontSize + 2);
    });

    // 捲動速度調節
    elements.scrollSpeedSlider.addEventListener("input", (e) => {
      applyScrollSpeed(parseFloat(e.target.value));
    });

    // 快捷檔位按鈕
    elements.presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        applyScrollSpeed(parseFloat(btn.dataset.speed));
      });
    });

    // 全螢幕切換
    elements.btnFullscreen.addEventListener("click", toggleFullscreen);

    // 鍵盤空白鍵 (Space) 控制開始/暫停
    window.addEventListener("keydown", (e) => {
      // 避免使用者在 select 上按空白時觸發
      if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleScrolling();
      }
    });
  }

  // 根據當前滾動位置更新章節下拉選單
  function syncChapterWithScroll() {
    const containerTop = elements.container.scrollTop;
    const containerHeight = elements.container.clientHeight;
    const midPoint = containerTop + containerHeight * 0.35;

    const sections = elements.content.querySelectorAll(".sutra-section-block");
    let activeSecId = 0;

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.offsetTop <= midPoint) {
        activeSecId = parseInt(sec.dataset.sectionId, 10);
      } else {
        break;
      }
    }

    if (!isNaN(activeSecId) && activeSecId !== currentSectionId) {
      currentSectionId = activeSecId;
      elements.chapterSelect.value = activeSecId;
    }
  }

  // 全螢幕功能
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // PWA Service Worker 註冊
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.log("Service Worker registration skipped:", err);
      });
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 啟動應用
  document.addEventListener("DOMContentLoaded", init);
})();
