// ========================================
// 圧倒的イコライザーUI - JavaScript
// ========================================

class EqualizerUI {
  constructor() {
    this.bandCount = 10;
    // 10バンドの周波数
    this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.gains = new Array(this.bandCount).fill(0);
    this.currentPreset = 'flat';
    this.sliders = [];
    this.debounceTimer = null;
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createSliders();
    this.updateSliders(); // スライダーの値を確実に更新
    this.setupEventListeners();
    this.updateConnectionLine();
    this.updateStatusBar();
    this.updateDeleteButtonVisibility(this.currentPreset);
    this.updateTargetSite(); // 現在のサイト名を更新
  }

  // スライダーを生成
  createSliders() {
    const container = document.getElementById('slidersContainer');
    const labelsContainer = document.getElementById('freqLabels');
    
    if (!container || !labelsContainer) return;
    
    container.innerHTML = '';
    labelsContainer.innerHTML = '';
    this.sliders = [];

    for (let i = 0; i < this.bandCount; i++) {
      // スライダーラッパー
      const wrapper = document.createElement('div');
      wrapper.className = 'slider-wrapper';

      // スライダー
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '-12';
      slider.max = '12';
      slider.step = '0.5';
      slider.value = this.gains[i] || 0;
      slider.className = 'eq-slider';
      slider.dataset.index = i;

      // dB値表示
      const dbValue = document.createElement('div');
      dbValue.className = 'db-value';
      dbValue.textContent = `${this.gains[i] >= 0 ? '+' : ''}${this.gains[i].toFixed(1)}dB`;

      // イベントリスナー
      slider.addEventListener('input', (e) => this.handleSliderInput(e));
      slider.addEventListener('change', (e) => this.handleSliderChange(e));

      wrapper.appendChild(slider);
      wrapper.appendChild(dbValue);
      container.appendChild(wrapper);
      this.sliders.push({ slider, dbValue });

      // 周波数ラベル
      const freqLabel = document.createElement('div');
      freqLabel.className = 'freq-label';
      freqLabel.textContent = this.formatFrequency(this.frequencies[i]);
      labelsContainer.appendChild(freqLabel);
    }
  }

  // スライダー入力処理（リアルタイム更新）
  handleSliderInput(e) {
    const index = parseInt(e.target.dataset.index);
    const value = parseFloat(e.target.value);
    
    this.gains[index] = value;
    
    // dB値表示を更新
    const dbValue = this.sliders[index].dbValue;
    dbValue.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(1)}dB`;
    
    // 接続線を更新
    this.updateConnectionLine();
    
    // デバウンス付きで設定を送信
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.applySettingsImmediately();
    }, 100);
  }

  // スライダー変更完了処理
  handleSliderChange(e) {
    this.saveSettings();
    this.currentPreset = 'custom';
    document.getElementById('presetSelect').value = 'custom';
  }

  // 接続線を更新（SVG）
  updateConnectionLine() {
    const svg = document.getElementById('connectionLine');
    if (!svg) return;

    const container = document.getElementById('slidersContainer');
    if (!container) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // 既存のパスを削除
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    if (this.sliders.length === 0) return;

    // パスを生成
    const points = [];
    const sliderWidth = width / this.bandCount;
    
    for (let i = 0; i < this.bandCount; i++) {
      const x = (i + 0.5) * sliderWidth;
      // -12dB (bottom) to +12dB (top)
      const normalizedValue = (this.gains[i] + 12) / 24; // 0 to 1
      const y = height - (normalizedValue * height);
      points.push({ x, y });
    }

    // SVGパスを作成
    let pathData = `M ${points[0].x} ${points[0].y}`;
    
    // スムーズな曲線を描画（Catmull-Rom spline）
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      
      // 制御点を計算
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      pathData += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }

  // イベントリスナー設定
  setupEventListeners() {
    // 電源トグル
    const enableToggle = document.getElementById('enableToggle');
    if (enableToggle) {
      enableToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        this.updatePowerStatus(enabled);
        chrome.storage.local.set({ equalizerEnabled: enabled });
        this.sendSettingsToContent();
      });
    }

    // プリセット選択
    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        this.applyPreset(e.target.value);
        this.updateDeleteButtonVisibility(e.target.value);
      });
    }

    // 保存ボタン
    const saveBtn = document.getElementById('savePresetBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveCurrentAsPreset();
      });
    }

    // 削除ボタン
    const deleteBtn = document.getElementById('deletePresetBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteCurrentPreset();
      });
    }

    // リセットボタン
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.reset();
      });
    }

    // ウィンドウリサイズ時に接続線を更新
    window.addEventListener('resize', () => {
      this.updateConnectionLine();
    });
  }

  // 電源ステータス更新
  updatePowerStatus(enabled) {
    const statusValue = document.getElementById('statusValue');
    const powerStatus = document.querySelector('.power-status');
    
    if (statusValue) {
      statusValue.textContent = enabled ? 'ONLINE' : 'OFFLINE';
      statusValue.classList.toggle('active', enabled);
    }
    
    if (powerStatus) {
      powerStatus.textContent = enabled ? 'ACTIVE' : 'INACTIVE';
    }
  }

  // ステータスバー更新
  updateStatusBar() {
    const bandCount = document.getElementById('bandCount');
    if (bandCount) {
      bandCount.textContent = this.bandCount;
    }
  }

  // 現在のサイト名を更新
  updateTargetSite() {
    const targetSiteElement = document.getElementById('targetSite');
    if (!targetSiteElement) return;

    // 現在のタブのURLを取得
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const url = new URL(tabs[0].url);
        const hostname = url.hostname;
        
        // サイト名を抽出して表示
        let siteName = this.getSiteDisplayName(hostname);
        targetSiteElement.textContent = siteName;
      } else {
        targetSiteElement.textContent = 'UNKNOWN';
      }
    });
  }

  // ホスト名から表示名を取得
  getSiteDisplayName(hostname) {
    // よく使われるサイトの表示名マッピング
    const siteMap = {
      'music.youtube.com': 'YOUTUBE MUSIC',
      'www.youtube.com': 'YOUTUBE',
      'youtube.com': 'YOUTUBE',
      'www.netflix.com': 'NETFLIX',
      'netflix.com': 'NETFLIX',
      'open.spotify.com': 'SPOTIFY',
      'www.spotify.com': 'SPOTIFY',
      'soundcloud.com': 'SOUNDCLOUD',
      'www.soundcloud.com': 'SOUNDCLOUD',
      'www.twitch.tv': 'TWITCH',
      'twitch.tv': 'TWITCH',
      'www.nicovideo.jp': 'NICONICO',
      'nicovideo.jp': 'NICONICO',
      'www.amazon.co.jp': 'AMAZON MUSIC',
      'music.amazon.co.jp': 'AMAZON MUSIC',
      'music.apple.com': 'APPLE MUSIC',
      'www.disneyplus.com': 'DISNEY+',
      'disneyplus.com': 'DISNEY+',
      'www.hulu.com': 'HULU',
      'hulu.com': 'HULU'
    };

    // 完全一致を確認
    if (siteMap[hostname]) {
      return siteMap[hostname];
    }

    // 部分一致を確認（サブドメイン対応）
    for (const [key, value] of Object.entries(siteMap)) {
      if (hostname.includes(key) || key.includes(hostname)) {
        return value;
      }
    }

    // マッピングがない場合は、ホスト名から表示名を生成
    // www.を削除
    let displayName = hostname.replace(/^www\./, '');
    
    // ドメイン部分のみを取得（例: youtube.com → YOUTUBE）
    const parts = displayName.split('.');
    if (parts.length >= 2) {
      displayName = parts[parts.length - 2]; // 最後から2番目の部分
    } else {
      displayName = parts[0];
    }
    
    // 大文字に変換して返す
    return displayName.toUpperCase();
  }

  // プリセット適用
  applyPreset(presetName) {
    // まずデフォルトプリセットを確認
    const presets = this.getPresets();
    const preset = presets[presetName];
    
    if (preset) {
      this.gains = [...preset.gains];
      this.currentPreset = presetName;
      this.updateSliders();
      this.updateConnectionLine();
      this.applySettingsImmediately();
      this.updateDeleteButtonVisibility(presetName);
    } else {
      // カスタムプリセットを確認
      chrome.storage.local.get(['customPresets'], (result) => {
        if (result.customPresets && result.customPresets[presetName]) {
          const customPreset = result.customPresets[presetName];
          this.gains = [...customPreset.gains];
          this.currentPreset = presetName;
          this.updateSliders();
          this.updateConnectionLine();
          this.applySettingsImmediately();
          this.updateDeleteButtonVisibility(presetName);
        }
      });
    }
  }

  // プリセット定義
  getPresets() {
    return {
      flat: {
        name: 'FLAT',
        gains: new Array(this.bandCount).fill(0)
      },
      perfect: {
        name: 'PERFECT',
        gains: [3, 6, 9, 7, 6, 5, 7, 9, 11, 8]
      },
      bass: {
        name: 'BASS BOOST',
        gains: [6, 6, 5, 4, 3, 2, 1, 0, -1, -1]
      },
      treble: {
        name: 'TREBLE BOOST',
        gains: [0, 0, 0, 0, 0, 1, 2, 4, 6, 6]
      },
      vocal: {
        name: 'VOCAL ENHANCE',
        gains: [-2, -1, 0, 1, 2, 4, 5, 5, 4, 2]
      },
      rock: {
        name: 'ROCK',
        gains: [4, 3, 2, 1, 0, -1, 0, 1, 2, 3]
      },
      jazz: {
        name: 'JAZZ',
        gains: [2, 2, 1, 0, 0, 0, 1, 2, 2, 1]
      },
      classical: {
        name: 'CLASSICAL',
        gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      electronic: {
        name: 'ELECTRONIC',
        gains: [5, 4, 3, 2, 1, 0, 1, 2, 4, 5]
      },
      custom: {
        name: 'CUSTOM',
        gains: [...this.gains]
      }
    };
  }

  // スライダー更新
  updateSliders() {
    for (let i = 0; i < this.bandCount; i++) {
      if (this.sliders[i]) {
        const { slider, dbValue } = this.sliders[i];
        slider.value = this.gains[i];
        dbValue.textContent = `${this.gains[i] >= 0 ? '+' : ''}${this.gains[i].toFixed(1)}dB`;
      }
    }
  }

  // リセット
  reset() {
    this.gains = new Array(this.bandCount).fill(0);
    this.currentPreset = 'flat';
    document.getElementById('presetSelect').value = 'flat';
    this.updateSliders();
    this.updateConnectionLine();
    this.applySettingsImmediately();
  }

  // プリセット保存
  saveCurrentAsPreset() {
    const name = prompt('プリセット名を入力してください:');
    if (name && name.trim()) {
      // デフォルトプリセット名は使用不可
      const defaultPresets = ['flat', 'perfect', 'bass', 'treble', 'vocal', 'rock', 'jazz', 'classical', 'electronic', 'custom'];
      if (defaultPresets.includes(name.toLowerCase())) {
        alert('このプリセット名は使用できません。別の名前を入力してください。');
        return;
      }
      
      chrome.storage.local.get(['customPresets'], (result) => {
        const customPresets = result.customPresets || {};
        const isUpdate = customPresets[name] !== undefined;
        
        customPresets[name] = {
          name: name,
          gains: [...this.gains]
        };
        
        chrome.storage.local.set({ customPresets }, () => {
          if (isUpdate) {
            alert(`プリセット "${name}" を更新しました`);
          } else {
            alert(`プリセット "${name}" を保存しました`);
            this.addPresetToSelect(name);
          }
          this.currentPreset = name;
          document.getElementById('presetSelect').value = name;
          this.updateDeleteButtonVisibility(name);
        });
      });
    }
  }

  // プリセット削除
  deleteCurrentPreset() {
    const presetSelect = document.getElementById('presetSelect');
    const presetName = presetSelect ? presetSelect.value : this.currentPreset;
    
    // デフォルトプリセットは削除不可
    const defaultPresets = ['flat', 'perfect', 'bass', 'treble', 'vocal', 'rock', 'jazz', 'classical', 'electronic', 'custom'];
    if (defaultPresets.includes(presetName)) {
      alert('デフォルトプリセットは削除できません。');
      return;
    }
    
    if (confirm(`プリセット "${presetName}" を削除しますか？`)) {
      chrome.storage.local.get(['customPresets'], (result) => {
        const customPresets = result.customPresets || {};
        
        if (customPresets[presetName]) {
          delete customPresets[presetName];
          chrome.storage.local.set({ customPresets }, () => {
            alert(`プリセット "${presetName}" を削除しました`);
            this.removePresetFromSelect(presetName);
            this.applyPreset('flat');
          });
        } else {
          alert('このプリセットは削除できません。');
        }
      });
    }
  }

  // プリセットをセレクトから削除
  removePresetFromSelect(name) {
    const select = document.getElementById('presetSelect');
    if (select) {
      const option = select.querySelector(`option[value="${name}"]`);
      if (option) {
        option.remove();
      }
    }
  }

  // 削除ボタンの表示/非表示を更新
  updateDeleteButtonVisibility(presetName) {
    const deleteBtn = document.getElementById('deletePresetBtn');
    if (!deleteBtn) return;
    
    const defaultPresets = ['flat', 'perfect', 'bass', 'treble', 'vocal', 'rock', 'jazz', 'classical', 'electronic', 'custom'];
    
    if (defaultPresets.includes(presetName)) {
      deleteBtn.style.opacity = '0.3';
      deleteBtn.style.pointerEvents = 'none';
    } else {
      deleteBtn.style.opacity = '1';
      deleteBtn.style.pointerEvents = 'auto';
    }
  }

  // プリセットをセレクトに追加
  addPresetToSelect(name) {
    const select = document.getElementById('presetSelect');
    if (select) {
      // 既に存在するかチェック
      const existingOption = select.querySelector(`option[value="${name}"]`);
      if (!existingOption) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      }
      select.value = name;
    }
  }

  // 周波数フォーマット
  formatFrequency(freq) {
    if (freq >= 1000) {
      const kValue = freq / 1000;
      return kValue % 1 === 0 ? `${kValue}k` : `${kValue.toFixed(1)}k`;
    }
    return `${freq}`;
  }

  // 設定を保存
  saveSettings() {
    const settings = {
      gains: this.gains,
      preset: this.currentPreset
    };
    chrome.storage.local.set({ equalizerSettings: settings });
  }

  // 設定を読み込み
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['equalizerSettings', 'equalizerEnabled', 'customPresets'], (result) => {
        // 初回起動時のデフォルト設定
        if (result.equalizerSettings === undefined) {
          // 初回起動: FLAT + すべて0dB
          this.gains = new Array(this.bandCount).fill(0);
          this.currentPreset = 'flat';
          
          const defaultSettings = {
            gains: new Array(this.bandCount).fill(0),
            preset: 'flat'
          };
          chrome.storage.local.set({ equalizerSettings: defaultSettings });
        } else {
          // 既存の設定を読み込み
          this.gains = result.equalizerSettings.gains || new Array(this.bandCount).fill(0);
          this.currentPreset = result.equalizerSettings.preset || 'flat';
          
          // gainsの長さを調整
          if (this.gains.length < this.bandCount) {
            this.gains = [...this.gains, ...new Array(this.bandCount - this.gains.length).fill(0)];
          } else if (this.gains.length > this.bandCount) {
            this.gains = this.gains.slice(0, this.bandCount);
          }
        }
        
        // 初期状態はOFF（false）
        const enabled = result.equalizerEnabled !== undefined ? result.equalizerEnabled : false;
        const enableToggle = document.getElementById('enableToggle');
        if (enableToggle) {
          enableToggle.checked = enabled;
          this.updatePowerStatus(enabled);
        }
        
        // 初期状態をストレージに保存（初回起動時）
        if (result.equalizerEnabled === undefined) {
          chrome.storage.local.set({ equalizerEnabled: false });
        }
        
        // カスタムプリセットを読み込み
        if (result.customPresets) {
          Object.keys(result.customPresets).forEach(name => {
            this.addPresetToSelect(name);
          });
        }
        
        // プリセット選択を更新
        const presetSelect = document.getElementById('presetSelect');
        if (presetSelect) {
          presetSelect.value = this.currentPreset;
        }
        
        resolve();
      });
    });
  }

  // 設定を即座に適用
  applySettingsImmediately() {
    this.saveSettings();
    this.sendSettingsToContent();
  }

  // content scriptに設定を送信
  sendSettingsToContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const enableToggle = document.getElementById('enableToggle');
        const enabled = enableToggle ? enableToggle.checked : true;
        
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'EQUALIZER_SETTINGS',
          settings: {
            gains: this.gains,
            enabled: enabled
          }
        }).catch(() => {
          // エラーは無視（タブがYouTube Musicでない場合など）
        });
      }
    });
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  new EqualizerUI();
});
