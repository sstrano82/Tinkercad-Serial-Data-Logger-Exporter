/**
 * ============================================================================
 * Tinkercad Serial Data Logger - Popup Script
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sectionTck = document.getElementById('section-tinkercad');
  const sectionNoTck = document.getElementById('section-no-tinkercad');
  const badgeStatus = document.getElementById('badge-status');
  const textConn = document.getElementById('text-conn');
  const textLines = document.getElementById('text-lines');
  const btnToggleRec = document.getElementById('btn-toggle-rec');
  const btnShowWidget = document.getElementById('btn-show-widget');
  const btnCsv = document.getElementById('btn-popup-csv');
  const btnTxt = document.getElementById('btn-popup-txt');
  const btnClear = document.getElementById('btn-popup-clear');

  let activeTabId = null;
  let isCurrentlyRecording = false;

  // 1. Trova la scheda attiva
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('tinkercad.com')) {
    // Non siamo su Tinkercad
    sectionTck.style.display = 'none';
    sectionNoTck.style.display = 'block';
    badgeStatus.className = 'status-badge status-idle';
    badgeStatus.textContent = 'NON ATTIVO';
    return;
  }

  // Siamo su Tinkercad
  activeTabId = tab.id;
  sectionTck.style.display = 'block';
  sectionNoTck.style.display = 'none';

  // 2. Chiedi lo stato al content script
  function queryStatus() {
    chrome.tabs.sendMessage(activeTabId, { action: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        textConn.textContent = 'In attesa del caricamento...';
        badgeStatus.className = 'status-badge status-idle';
        badgeStatus.textContent = 'CARICAMENTO';
        return;
      }

      isCurrentlyRecording = res.isRecording;
      textLines.textContent = res.count || 0;

      if (res.isConnected) {
        textConn.textContent = '🟢 Connesso al monitor seriale';
        textConn.style.color = '#34d399';
      } else {
        textConn.textContent = '⏳ In attesa del monitor seriale';
        textConn.style.color = '#fbbf24';
      }

      if (res.isRecording) {
        badgeStatus.className = 'status-badge status-rec';
        badgeStatus.textContent = 'REC ATTIVO';
        btnToggleRec.className = 'btn btn-record is-recording';
        btnToggleRec.innerHTML = '<span>■</span> Ferma Registrazione';
      } else {
        badgeStatus.className = 'status-badge status-idle';
        badgeStatus.textContent = 'PRONTO';
        btnToggleRec.className = 'btn btn-record';
        btnToggleRec.innerHTML = '<span>●</span> Avvia Registrazione';
      }
    });
  }

  queryStatus();
  const pollInterval = setInterval(queryStatus, 1000);
  window.addEventListener('unload', () => clearInterval(pollInterval));

  // 3. Gestori pulsanti
  btnToggleRec.addEventListener('click', () => {
    const action = isCurrentlyRecording ? 'STOP_RECORDING' : 'START_RECORDING';
    chrome.tabs.sendMessage(activeTabId, { action }, () => {
      queryStatus();
    });
  });

  btnShowWidget.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTabId, { action: 'SHOW_WIDGET' }, () => {
      window.close(); // Chiudi il popup per mostrare il widget sulla pagina
    });
  });

  btnCsv.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTabId, { action: 'DOWNLOAD_CSV' });
  });

  btnTxt.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTabId, { action: 'DOWNLOAD_TXT' });
  });

  btnClear.addEventListener('click', () => {
    if (confirm('Vuoi davvero cancellare le righe registrate?')) {
      chrome.tabs.sendMessage(activeTabId, { action: 'CLEAR_BUFFER' }, () => {
        queryStatus();
      });
    }
  });
});

