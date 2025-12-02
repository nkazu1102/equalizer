// イコライザーエンジン - Web Audio APIを使用
(function() {
  'use strict';
  
  // 既に定義されている場合は再定義しない
  if (typeof window !== 'undefined' && window.EqualizerEngine) {
    console.log('EqualizerEngineは既に定義されています');
    return;
  }
  
  class EqualizerEngine {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.bands = [];
      this.masterGainNode = null; // マスターゲインノード
      this.inputNode = null;
      this.outputNode = null;
      this.bandCount = 10; // 10バンドイコライザー
      this.enabled = false; // イコライザーの有効/無効（初期状態はOFF）
      this.initializeBands();
    }

    initializeBands() {
      this.bandCount = 10;
      // 10バンドの周波数を設定（画像に合わせて）
      const selectedFreqs = [
        32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000
      ];
      
      this.bands = selectedFreqs.map((freq, index) => {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        // Q値を適切に設定（1.0）して音質を改善
        filter.Q.value = 1.0;
        filter.gain.value = 0; // デフォルトは0dB（変更なし）
        
        return {
          frequency: freq,
          gain: 0,
          filter: filter,
          index: index
        };
      });

      // マスターゲインノードを作成
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = 1.0; // デフォルトは1.0（0dB）

      // チェーンを構築
      this.connectChain();
    }

    connectChain() {
      if (this.bands.length === 0 || !this.masterGainNode) return;

      // バンド間を接続
      for (let i = 0; i < this.bands.length - 1; i++) {
        this.bands[i].filter.connect(this.bands[i + 1].filter);
      }

      // 最後のバンドをマスターゲインノードに接続
      this.bands[this.bands.length - 1].filter.connect(this.masterGainNode);
    }

    setInputNode(node) {
      this.inputNode = node;
      if (this.bands.length > 0 && this.inputNode) {
        this.inputNode.disconnect();
        this.inputNode.connect(this.bands[0].filter);
      }
    }

    setOutputNode(node) {
      this.outputNode = node;
      if (this.masterGainNode && this.outputNode) {
        // マスターゲインノードから出力へ接続
        this.masterGainNode.disconnect();
        this.masterGainNode.connect(this.outputNode);
      }
    }

    setBandGain(bandIndex, gain) {
      if (bandIndex >= 0 && bandIndex < this.bands.length) {
        // -12dB から +12dB の範囲
        const clampedGain = Math.max(-12, Math.min(12, gain));
        this.bands[bandIndex].gain = clampedGain;
        // イコライザーが有効な場合のみゲインを適用
        this.bands[bandIndex].filter.gain.value = this.enabled ? clampedGain : 0;
        
        // 自動ゲイン補正を適用
        this.updateMasterGain();
      }
    }

    getBandGain(bandIndex) {
      if (bandIndex >= 0 && bandIndex < this.bands.length) {
        return this.bands[bandIndex].gain;
      }
      return 0;
    }

  // イコライザーの有効/無効を設定
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`🎚️ イコライザーを${enabled ? '有効' : '無効'}にしました`);
    
    // すべてのバンドのゲインを更新
    this.bands.forEach(band => {
      band.filter.gain.value = enabled ? band.gain : 0;
    });
    
    // マスターゲインも更新
    this.updateMasterGain();
  }

    // イコライザーの有効/無効を取得
    isEnabled() {
      return this.enabled;
    }

  // 自動ゲイン補正を更新
  updateMasterGain() {
    if (!this.masterGainNode) return;

    // イコライザーが無効の時は補正なし（1.0 = 0dB）
    if (!this.enabled) {
      this.masterGainNode.gain.value = 1.0;
      return;
    }

    let compensation = 0;
    
    // すべてのバンドのゲインを確認
    let maxPositiveGain = 0;
    let totalPositiveGain = 0;
    let positiveCount = 0;

    this.bands.forEach(band => {
      if (band.gain > 0) {
        maxPositiveGain = Math.max(maxPositiveGain, band.gain);
        totalPositiveGain += band.gain;
        positiveCount++;
      }
    });

    if (positiveCount > 0) {
      // 音質の変化と迫力を保ちつつ、音割れを完全に防ぐバランス
      // 最大ゲインの63%を補正（迫力を残しつつ音割れを防ぐ）
      const maxGainCompensation = -maxPositiveGain * 0.63;
      
      // 複数バンドの累積が29dBを超える場合は追加補正
      let multiBandCompensation = 0;
      if (totalPositiveGain > 29) {
        multiBandCompensation = -(totalPositiveGain - 29) * 0.21;
      }
      
      // 2つの補正を合算（ただし-8.5dBまで）
      compensation = Math.max(maxGainCompensation + multiBandCompensation, -8.5);
    }

    // dBをリニアゲインに変換
    const linearGain = Math.pow(10, compensation / 20);
    
    // マスターゲインを更新
    this.masterGainNode.gain.value = linearGain;
      
      if (compensation !== 0) {
        console.log(`🎚️ マスターゲイン補正: ${compensation.toFixed(2)}dB (リニアゲイン: ${linearGain.toFixed(3)})`);
      }
    }

    reset() {
      this.bands.forEach(band => {
        band.gain = 0;
        band.filter.gain.value = 0;
      });
      
      // マスターゲインをリセット
      if (this.masterGainNode) {
        this.masterGainNode.gain.value = 1.0;
      }
    }

    getBandCount() {
      return this.bandCount;
    }

    getFrequencies() {
      return this.bands.map(band => band.frequency);
    }
  }

  // グローバルに公開（ページのwindowオブジェクトに確実に公開）
  const targetWindow = window || self || globalThis || this;
  
  if (targetWindow) {
    targetWindow.EqualizerEngine = EqualizerEngine;
    console.log('EqualizerEngineクラスがエクスポートされました');
  } else {
    console.error('グローバルオブジェクトが見つかりません');
  }
})();
