// YouTube Musicのオーディオをインターセプトしてイコライザーを適用
(function() {
  'use strict';

  let isEnabled = false; // 初期状態はOFF
  let engineLoaded = false;

  // イコライザーエンジンを初期化
  function initializeEqualizer() {
    // 既に読み込まれている場合はスキップ
    if (engineLoaded) {
      console.log('イコライザーエンジンは既に読み込まれています');
      return;
    }

    try {
      // 拡張機能のコンテキストが有効か確認
      if (!chrome.runtime || !chrome.runtime.getURL) {
        console.error('拡張機能のコンテキストが無効です');
        return;
      }

      // equalizer.jsを読み込む（ページのコンテキストに注入）
      const equalizerScript = document.createElement('script');
      equalizerScript.src = chrome.runtime.getURL('equalizer.js');
      equalizerScript.type = 'text/javascript';
      
      equalizerScript.onload = () => {
        console.log('equalizer.jsスクリプトが読み込まれました');
        
        // page-context.jsを読み込む（ページのコンテキストに注入）
        const pageScript = document.createElement('script');
        pageScript.src = chrome.runtime.getURL('page-context.js');
        pageScript.type = 'text/javascript';
        
        pageScript.onload = () => {
          console.log('page-context.jsスクリプトが読み込まれました');
          engineLoaded = true;
          
          // ページのイベントをリッスン
          window.addEventListener('EqualizerEngineLoaded', () => {
            console.log('EqualizerEngineが利用可能になりました');
            
            // 既存のオーディオ要素を処理
            setTimeout(() => {
              processExistingAudio();
              observeAudioElements();
            }, 1000);
          }, { once: true });
        };
        
        pageScript.onerror = (error) => {
          console.error('page-context.jsの読み込みに失敗しました:', error);
        };
        
        (document.head || document.documentElement).appendChild(pageScript);
      };
      
      equalizerScript.onerror = (error) => {
        console.error('equalizer.jsの読み込みに失敗しました:', error);
        engineLoaded = false;
      };
      
      (document.head || document.documentElement).appendChild(equalizerScript);
      
    } catch (error) {
      console.error('イコライザーの初期化に失敗しました:', error);
    }
  }

  // 既存のオーディオ要素を処理
  function processExistingAudio() {
    const audioElements = document.querySelectorAll('audio, video');
    audioElements.forEach(element => {
      if (!element.dataset.equalizerProcessed) {
        element.dataset.equalizerProcessed = 'true';
      }
    });
  }

  // オーディオ要素を監視
  function observeAudioElements() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
              node.dataset.equalizerProcessed = 'true';
            }
            const audioElements = node.querySelectorAll?.('audio, video');
            if (audioElements) {
              audioElements.forEach(element => {
                element.dataset.equalizerProcessed = 'true';
              });
            }
          }
        });
      });
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // メッセージリスナー（設定変更をページのコンテキストに送信）
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EQUALIZER_SETTINGS') {
      // 設定をストレージに保存
      const settings = {
        equalizerSettings: {
          gains: message.settings.gains || [],
          enabled: message.settings.enabled !== undefined ? message.settings.enabled : true
        },
        equalizerEnabled: message.settings.enabled !== undefined ? message.settings.enabled : true
      };
      
      chrome.storage.local.set(settings);
      
      // ページのコンテキストに設定を渡す（postMessageを使用）
      window.postMessage({
        type: 'EQUALIZER_SETTINGS_CHANGED',
        settings: settings
      }, '*');
      
      sendResponse({ success: true });
    }
    return true;
  });

  // ストレージ変更をリッスン
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.equalizerEnabled) {
        isEnabled = changes.equalizerEnabled.newValue;
      }
      
      if (changes.equalizerSettings) {
        // ページのコンテキストに設定変更を通知（postMessageを使用）
        const settings = {
          equalizerSettings: changes.equalizerSettings.newValue,
          equalizerEnabled: isEnabled
        };
        
        window.postMessage({
          type: 'EQUALIZER_SETTINGS_CHANGED',
          settings: settings
        }, '*');
      }
    }
  });
  
  // 初期設定を読み込んでページのコンテキストに渡す
  chrome.storage.local.get(['equalizerSettings', 'equalizerEnabled'], (result) => {
    // 初期状態はOFF（false）
    isEnabled = result.equalizerEnabled !== undefined ? result.equalizerEnabled : false;
    
    const settings = {
      equalizerSettings: result.equalizerSettings || { gains: [] },
      equalizerEnabled: isEnabled
    };
    
    // ページのコンテキストに設定を渡す
    window.postMessage({
      type: 'EQUALIZER_SETTINGS_CHANGED',
      settings: settings
    }, '*');
  });

  // ページ読み込み時に初期化
  function startInitialization() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeEqualizer, 500);
      });
    } else {
      setTimeout(initializeEqualizer, 500);
    }
  }

  startInitialization();

  // 念のため、windowが利用可能になったら再度試行
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      if (!engineLoaded) {
        console.log('再初期化を試みます...');
        setTimeout(initializeEqualizer, 500);
      }
    });
  }
})();
