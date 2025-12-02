// ページコンテキストで実行されるスクリプト（CSP対応）
(function() {
  'use strict';
  
  // EqualizerEngineが読み込まれたか確認
  function checkEqualizerEngine() {
    if (typeof window.EqualizerEngine !== 'undefined') {
      window.dispatchEvent(new CustomEvent('EqualizerEngineLoaded'));
      console.log('EqualizerEngineがページのコンテキストで利用可能です');
      return true;
    }
    return false;
  }
  
  // 初期チェック
  if (!checkEqualizerEngine()) {
    setTimeout(() => {
      if (!checkEqualizerEngine()) {
        console.error('EqualizerEngineがページのコンテキストで見つかりません');
      }
    }, 500);
  }
  
  // AudioContextをインターセプト
  function interceptAudioContext() {
    if (typeof window.EqualizerEngine === 'undefined') {
      console.error('EqualizerEngineが利用できません');
      return;
    }
    
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!OriginalAudioContext) return;
    
    const processedNodes = new WeakSet();
    const equalizerEngines = new Map();
    
    // 設定を読み込む関数
    function loadSettings(callback) {
      const settings = window.__equalizerSettings || { equalizerSettings: { gains: [] } };
      
      // 設定が空の場合は、デフォルト値（すべて0dB）を使用
      if (!settings.equalizerSettings || !settings.equalizerSettings.gains || settings.equalizerSettings.gains.length === 0) {
        settings.equalizerSettings = { gains: new Array(10).fill(0) };
      }
      
      callback(settings);
    }
    
    // 設定を更新する関数
    function updateSettings(settings) {
      window.__equalizerSettings = settings;
      equalizerEngines.forEach(engine => {
        // イコライザーの有効/無効を設定
        if (settings.equalizerEnabled !== undefined) {
          engine.setEnabled(settings.equalizerEnabled);
        }
        
        // ゲインを設定
        if (settings.equalizerSettings && settings.equalizerSettings.gains) {
          settings.equalizerSettings.gains.forEach((gain, index) => {
            engine.setBandGain(index, gain);
          });
        }
      });
    }
    
    // 設定変更イベントをリッスン
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'EQUALIZER_SETTINGS_CHANGED') {
        console.log('⚙️ 設定変更を受信:', event.data.settings);
        updateSettings(event.data.settings);
      }
    });
    
    window.addEventListener('EqualizerSettingsChanged', (event) => {
      updateSettings(event.detail);
    });
    
    // audio/video要素を監視してイコライザーを適用
    const processedElements = new WeakSet();
    
    function processMediaElement(element) {
      // 既に処理済みの場合はスキップ
      if (processedElements.has(element)) {
        console.log('⏭️ この要素は既に処理済みです', element);
        return;
      }
      
      // 要素が再生可能になるまで待つ
      const tryProcess = () => {
        // 再度チェック（非同期処理中に他の処理が入る可能性があるため）
        if (processedElements.has(element)) {
          console.log('⏭️ この要素は既に処理済みです（再チェック）', element);
          return;
        }
        
        if (element.readyState >= 2) { // HAVE_CURRENT_DATA以上
          try {
            // 処理済みとしてマーク（他の処理が入らないように）
            processedElements.add(element);
            console.log('🎵 audio/video要素を処理します', element);
            
            // 新しいAudioContextを作成
            const audioContext = new OriginalAudioContext();
            let eqEngine = equalizerEngines.get(audioContext);
            
            if (!eqEngine) {
              console.log('🎚️ 新しいイコライザーエンジンを作成します');
              eqEngine = new window.EqualizerEngine(audioContext);
              equalizerEngines.set(audioContext, eqEngine);
            }
            
            // 設定を適用（エンジンが既に存在する場合も設定を更新）
            loadSettings((result) => {
              // イコライザーの有効/無効を設定
              if (result.equalizerEnabled !== undefined) {
                eqEngine.setEnabled(result.equalizerEnabled);
              }
              
              if (result.equalizerSettings && result.equalizerSettings.gains && result.equalizerSettings.gains.length > 0) {
                console.log('⚙️ 設定を適用:', result.equalizerSettings.gains);
                result.equalizerSettings.gains.forEach((gain, index) => {
                  eqEngine.setBandGain(index, gain);
                });
              } else {
                console.log('⚙️ 設定が空です。デフォルト値（0dB）を使用します');
              }
            });
            
            // まずcreateMediaElementSourceを試す（これが最も確実）
            try {
              const source = audioContext.createMediaElementSource(element);
              // このAudioContextを処理済みとしてマーク（AudioDestinationNodeへの接続インターセプトをスキップ）
              processedAudioContexts.add(audioContext);
              source.connect(eqEngine.bands[0].filter);
              eqEngine.masterGainNode.connect(audioContext.destination);
              
              console.log('✅ イコライザーを接続しました（createMediaElementSource経由）');
              return; // 成功したら終了
            } catch (error) {
              // createMediaElementSourceが失敗した場合はcaptureStream()を使う
              console.log('⚠️ createMediaElementSourceが失敗しました。captureStream()を試します:', error.message);
              
              if (element.captureStream) {
                const stream = element.captureStream();
                const source = audioContext.createMediaStreamSource(stream);
                
                // イコライザーを接続
                source.connect(eqEngine.bands[0].filter);
                eqEngine.masterGainNode.connect(audioContext.destination);
                
                console.log('✅ イコライザーを接続しました（captureStream経由）');
              } else {
                console.error('❌ captureStream()も利用できません');
                processedElements.delete(element);
              }
            }
          } catch (error) {
            console.error('❌ 要素処理エラー:', error);
            processedElements.delete(element);
          }
        } else {
          setTimeout(tryProcess, 100);
        }
      };
      
      if (element.readyState >= 2) {
        tryProcess();
      } else {
        element.addEventListener('loadeddata', tryProcess, { once: true });
        setTimeout(tryProcess, 1000);
      }
    }
    
    // audio/video要素を監視
    function observeMediaElements() {
      const observer = new MutationObserver(() => {
        const elements = document.querySelectorAll('audio, video');
        elements.forEach(element => {
          if (!processedElements.has(element) && (element.src || element.srcObject)) {
            processMediaElement(element);
          }
        });
      });
      
      if (document.body || document.documentElement) {
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      }
      
      // 既存の要素も処理
      const checkElements = () => {
        const elements = document.querySelectorAll('audio, video');
        console.log('🔍 audio/video要素を検索中...', elements.length, '個見つかりました');
        elements.forEach(element => {
          if (!processedElements.has(element) && (element.src || element.srcObject)) {
            processMediaElement(element);
          }
        });
      };
      
      setTimeout(checkElements, 500);
      setTimeout(checkElements, 2000);
      setTimeout(checkElements, 5000);
    }
    
    // createMediaElementSource経由で接続されたAudioContextを追跡
    const processedAudioContexts = new WeakSet();
    
    // AudioNodeのconnectメソッドをインターセプト
    const OriginalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(destination, outputIndex, inputIndex) {
      // destinationがAudioDestinationNodeの場合
      if (destination && destination.constructor && destination.constructor.name === 'AudioDestinationNode') {
        const audioContext = destination.context;
        
        // createMediaElementSource経由で既に処理済みのAudioContextの場合は完全にスキップ
        if (processedAudioContexts.has(audioContext)) {
          return OriginalConnect.call(this, destination, outputIndex, inputIndex);
        }
        
        // 接続しようとしているノードが既にイコライザーのバンド（BiquadFilterNode）の場合はスキップ
        // （createMediaElementSource経由で既に接続されているため）
        if (this.constructor && this.constructor.name === 'BiquadFilterNode') {
          // イコライザーのバンドからAudioDestinationNodeへの直接接続は許可
          return OriginalConnect.call(this, destination, outputIndex, inputIndex);
        }
        
        if (audioContext && !processedNodes.has(this)) {
          try {
            processedNodes.add(this);
            console.log('🎵 AudioDestinationNodeへの接続を検出しました！', this);
            
            let eqEngine = equalizerEngines.get(audioContext);
            if (!eqEngine) {
              console.log('🎚️ 新しいイコライザーエンジンを作成します');
              eqEngine = new window.EqualizerEngine(audioContext);
              equalizerEngines.set(audioContext, eqEngine);
              
              loadSettings((result) => {
                // イコライザーの有効/無効を設定
                if (result.equalizerEnabled !== undefined) {
                  eqEngine.setEnabled(result.equalizerEnabled);
                }
                
                if (result.equalizerSettings && result.equalizerSettings.gains) {
                  console.log('⚙️ 設定を適用:', result.equalizerSettings.gains);
                  result.equalizerSettings.gains.forEach((gain, index) => {
                    eqEngine.setBandGain(index, gain);
                  });
                }
              });
              
              // マスターゲインノードを実際のdestinationに接続（元のconnectを使用）
              OriginalConnect.call(eqEngine.masterGainNode, destination);
            }
            
            try {
              this.disconnect();
            } catch (e) {
              // 既に切断されている場合は無視
            }
            
            // 元のconnectメソッドを使用してイコライザーに接続（無限ループを防ぐ）
            OriginalConnect.call(this, eqEngine.bands[0].filter);
            console.log('✅ イコライザーを接続しました！音質が変化するはずです');
            return destination;
          } catch (error) {
            console.error('❌ イコライザー接続エラー:', error);
            return OriginalConnect.call(this, destination, outputIndex, inputIndex);
          }
        }
      }
      
      return OriginalConnect.call(this, destination, outputIndex, inputIndex);
    };
    
    // AudioContextのコンストラクタをインターセプト
    const AudioContextWrapper = function(...args) {
      const ctx = new OriginalAudioContext(...args);
      console.log('🔊 新しいAudioContextが作成されました', ctx);
      
      const originalDestination = ctx.destination;
      let eqEngine = null;
      
      // createMediaElementSourceをオーバーライド
      const originalCreateMediaElementSource = ctx.createMediaElementSource.bind(ctx);
      ctx.createMediaElementSource = function(element) {
        console.log('🎬 createMediaElementSourceが呼ばれました', element);
        const source = originalCreateMediaElementSource(element);
        
        if (!processedNodes.has(source)) {
          try {
            processedNodes.add(source);
            
            if (!eqEngine) {
              console.log('🎚️ イコライザーエンジンを作成します');
              eqEngine = new window.EqualizerEngine(ctx);
              equalizerEngines.set(ctx, eqEngine);
              
              loadSettings((result) => {
                // イコライザーの有効/無効を設定
                if (result.equalizerEnabled !== undefined) {
                  eqEngine.setEnabled(result.equalizerEnabled);
                }
                
                if (result.equalizerSettings && result.equalizerSettings.gains) {
                  result.equalizerSettings.gains.forEach((gain, index) => {
                    eqEngine.setBandGain(index, gain);
                  });
                }
              });
              
              eqEngine.masterGainNode.connect(originalDestination);
            }
            
            try {
              source.disconnect();
            } catch (e) {}
            
            source.connect(eqEngine.bands[0].filter);
            console.log('✅ イコライザーを接続しました（createMediaElementSource経由）');
          } catch (error) {
            console.error('❌ createMediaElementSource接続エラー:', error);
          }
        }
        
        return source;
      };
      
      return ctx;
    };
    
    // プロトタイプを継承
    AudioContextWrapper.prototype = OriginalAudioContext.prototype;
    AudioContextWrapper.prototype.constructor = AudioContextWrapper;
    
    // 静的プロパティをコピー
    Object.setPrototypeOf(AudioContextWrapper, OriginalAudioContext);
    Object.keys(OriginalAudioContext).forEach(key => {
      AudioContextWrapper[key] = OriginalAudioContext[key];
    });
    
    // グローバルに置き換え
    window.AudioContext = AudioContextWrapper;
    if (window.webkitAudioContext) {
      window.webkitAudioContext = AudioContextWrapper;
    }
    
    // audio/video要素を監視開始
    observeMediaElements();
    
    console.log('✅ AudioContextがインターセプトされました');
  }
  
  // EqualizerEngineが読み込まれたらAudioContextをインターセプト
  window.addEventListener('EqualizerEngineLoaded', () => {
    interceptAudioContext();
  }, { once: true });
  
  // 既に読み込まれている場合は即座に実行
  if (typeof window.EqualizerEngine !== 'undefined') {
    interceptAudioContext();
  }
  
  // 設定の初期化（初期状態はOFF）
  if (!window.__equalizerSettings) {
    window.__equalizerSettings = { 
      equalizerSettings: { gains: [] },
      equalizerEnabled: false
    };
  }
})();
