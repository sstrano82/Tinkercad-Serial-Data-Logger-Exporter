/**
 * ============================================================================
 * Tinkercad Serial Data Logger & Exporter
 * Tool didattico per scuole e privati per l'acquisizione dati da Tinkercad/Arduino
 * 
 * Autore & Copyright (c) 2026 Salvatore Strano
 * Tutti i diritti riservati.
 * ============================================================================
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__TCK_SERIAL_LOGGER_INJECTED__) {
    return;
  }
  window.__TCK_SERIAL_LOGGER_INJECTED__ = true;

  console.log('[Tinkercad Serial Logger] Inizializzazione content script...');

  // --------------------------------------------------------------------------
  // STATO DELL'APPLICAZIONE
  // --------------------------------------------------------------------------
  const state = {
    isConnected: false,
    isSimulationActive: false,
    isRecording: false,
    isStreamingToFile: false,
    recordingStartTime: 0,
    capturedLines: [],       // Array di oggetti { index, raw, elapsedSec, timeStr }
    streamBuffer: '',
    lastObservedLength: 0,
    lastObservedText: '',
    fileWritableStream: null,
    fileName: '',

    // Opzioni di esportazione
    options: {
      delimiter: ';',        // ';' per Excel IT, ',' per Scilab / US, '\t' per TSV
      addTimestamp: 'sec',   // 'none', 'sec', 'time'
      decimalComma: true,    // converti '.' in ',' nei decimali per Excel Italiano
      customHeader: '',      // Intestazione colonne personalizzata (es. Tempo;Ch1;Ch2)
      autoRecordOnSim: true, // Avvia automaticamente REC quando parte la simulazione
      clearTinkercad: false, // Pulisce periodicamente il monitor di Tinkercad per non appesantire il browser
    }
  };

  // Carica preferenze salvate
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['tck_options'], (res) => {
      if (res && res.tck_options) {
        state.options = { ...state.options, ...res.tck_options };
        applyOptionsToUI();
      }
    });
  }

  // Riferimenti DOM di Tinkercad
  let domSimulationBtn = null;
  let domSerialOutput = null;
  let domSerialClear = null;
  let domSerialInput = null;
  let domSerialSend = null;
  let serialObserver = null;

  // --------------------------------------------------------------------------
  // SCANSIONE E COLLEGAMENTO AL DOM DI TINKERCAD
  // --------------------------------------------------------------------------
  function findTinkercadElements() {
    // 1. Bottone simulazione
    if (!domSimulationBtn || !document.contains(domSimulationBtn)) {
      domSimulationBtn = document.querySelector('.js-toggleSimulation') ||
                         document.querySelector('[data-action="toggle-simulation"]') ||
                         Array.from(document.querySelectorAll('button, a')).find(el => {
                           const t = (el.textContent || '').trim().toLowerCase();
                           return t.includes('start simulation') || t.includes('avvia simulazione') ||
                                  t.includes('stop simulation') || t.includes('interrompi simulazione');
                         });
    }

    // 2. Elemento di output del monitor seriale
    const currentSerialOutput = document.querySelector('.js-code_panel__serial__text') ||
                                document.querySelector('.code_panel__serial__content__text') ||
                                document.querySelector('.code_panel__serial__text') ||
                                document.querySelector('[class*="serial__text"]');

    // 3. Bottone Clear (I6: ricerca ottimizzata, non ripete se già trovato)
    if (!domSerialClear || !document.contains(domSerialClear)) {
      domSerialClear = document.querySelector('.js-code_panel__serial__clear') ||
                       document.querySelector('.code_panel__serial__button[data-action="clear"]') ||
                       null;
      if (!domSerialClear) {
        // Fallback testo: cerca solo nel pannello seriale
        const serialRoot = document.querySelector('[class*="code_panel__serial"]') || document;
        domSerialClear = Array.from(serialRoot.querySelectorAll('a, button'))
          .find(el => (el.textContent || '').trim().toLowerCase() === 'clear') || null;
      }
    }

    // Se l'elemento di output è cambiato o appena apparso
    if (currentSerialOutput && currentSerialOutput !== domSerialOutput) {
      domSerialOutput = currentSerialOutput;
      attachSerialObserver();
      state.isConnected = true;
      updateStatusBanner(true);
    } else if (!domSerialOutput || !document.contains(domSerialOutput)) {
      state.isConnected = false;
      updateStatusBanner(false);
    }

    // Monitora stato simulazione
    checkSimulationStatus();
  }

  function checkSimulationStatus() {
    if (!domSimulationBtn) return;
    const wasActive = state.isSimulationActive;
    const isActive = domSimulationBtn.classList.contains('active') ||
                     (domSimulationBtn.textContent || '').toLowerCase().includes('stop') ||
                     (domSimulationBtn.textContent || '').toLowerCase().includes('interrompi');

    state.isSimulationActive = isActive;

    if (!wasActive && isActive) {
      // La simulazione è appena partita!
      onSimulationStarted();
    } else if (wasActive && !isActive) {
      // La simulazione è stata fermata!
      onSimulationStopped();
    }
  }

  function onSimulationStarted() {
    console.log('[Tinkercad Serial Logger] Simulazione avviata.');
    if (state.options.autoRecordOnSim && !state.isRecording) {
      startRecording();
    }
  }

  function onSimulationStopped() {
    console.log('[Tinkercad Serial Logger] Simulazione interrotta.');
    if (state.isRecording) {
      stopRecording();
    }
  }

  // --------------------------------------------------------------------------
  // OSSERVATORE DELLO STREAM SERIALE (MUTATION OBSERVER)
  // --------------------------------------------------------------------------
  function attachSerialObserver() {
    if (!domSerialOutput) return;

    if (serialObserver) {
      serialObserver.disconnect();
    }

    state.lastObservedLength = (domSerialOutput.textContent || '').length;
    state.lastObservedText = domSerialOutput.textContent || '';

    serialObserver = new MutationObserver(() => {
      handleSerialDOMChange();
    });

    serialObserver.observe(domSerialOutput, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    console.log('[Tinkercad Serial Logger] MutationObserver collegato al monitor seriale.');
  }

  function handleSerialDOMChange() {
    if (!domSerialOutput) return;

    const currentText = domSerialOutput.textContent || '';
    if (!currentText) {
      state.lastObservedLength = 0;
      state.lastObservedText = '';
      return;
    }

    let chunk = '';

    if (currentText.length > state.lastObservedLength) {
      // Normale aggiunta di testo
      if (currentText.startsWith(state.lastObservedText)) {
        chunk = currentText.slice(state.lastObservedLength);
      } else {
        // Tinkercad potrebbe aver rimosso testo in testa (buffer circolare)
        const sample = state.lastObservedText.slice(-30);
        const idx = currentText.lastIndexOf(sample);
        if (idx !== -1) {
          chunk = currentText.slice(idx + sample.length);
        } else {
          chunk = currentText;
        }
      }
      state.lastObservedLength = currentText.length;
      state.lastObservedText = currentText;
    } else if (currentText.length < state.lastObservedLength) {
      // Il monitor è stato pulito (Clear)
      chunk = currentText;
      state.lastObservedLength = currentText.length;
      state.lastObservedText = currentText;
    } else if (currentText !== state.lastObservedText) {
      // Lunghezza uguale ma testo diverso: reset senza chunk (evita duplicati)
      state.lastObservedLength = currentText.length;
      state.lastObservedText = currentText;
    }

    if (chunk) {
      processIncomingChunk(chunk);
    }
  }

  function processIncomingChunk(chunk) {
    if (!state.isRecording) {
      return;
    }

    state.streamBuffer += chunk;

    // Spezza il buffer per righe
    const parts = state.streamBuffer.split(/\r?\n/);
    // L'ultimo elemento è la riga incompleta in attesa del terminatore \n
    state.streamBuffer = parts.pop() || '';

    for (const rawLine of parts) {
      if (rawLine.trim().length > 0 || state.capturedLines.length > 0) {
        addRecordedLine(rawLine);
      }
    }
  }

  const MAX_CAPTURED_LINES = 50000;

  function addRecordedLine(rawLine) {
    if (state.capturedLines.length >= MAX_CAPTURED_LINES) {
      showTemporaryToast(`⚠️ Limite ${MAX_CAPTURED_LINES} righe raggiunto. Esporta e svuota i dati.`);
      return;
    }
    const now = performance.now();
    const elapsedSec = ((now - state.recordingStartTime) / 1000).toFixed(3);
    const timeStr = new Date().toLocaleTimeString();

    const record = {
      index: state.capturedLines.length + 1,
      raw: rawLine,
      elapsedSec: elapsedSec,
      timeStr: timeStr,
    };

    state.capturedLines.push(record);

    // Se lo streaming su file nativo (File System Access API) è attivo, scrivi subito sul disco
    if (state.fileWritableStream) {
      writeRecordToFileStream(record);
    }

    // Aggiorna UI
    updateStatsCounter();
    addPreviewLine(record);
  }

  async function writeRecordToFileStream(record) {
    if (!state.fileWritableStream) return;
    try {
      const lineFormatted = formatRecordForExport(record);
      await state.fileWritableStream.write(lineFormatted + '\r\n');
    } catch (err) {
      console.error('[Tinkercad Serial Logger] Errore di scrittura su file stream:', err);
    }
  }

  // --------------------------------------------------------------------------
  // CONTROLLO REGISTRAZIONE
  // --------------------------------------------------------------------------
  function startRecording() {
    state.isRecording = true;
    state.recordingStartTime = performance.now();
    state.streamBuffer = '';

    // Aggiorna offset iniziale monitor seriale
    if (domSerialOutput) {
      state.lastObservedLength = (domSerialOutput.textContent || '').length;
      state.lastObservedText = domSerialOutput.textContent || '';
    }

    updateUIRecordingState();
    console.log('[Tinkercad Serial Logger] Registrazione avviata.');
  }

  async function stopRecording() {
    if (!state.isRecording) return;

    // Se c'era una riga residua nel buffer, salvala
    if (state.streamBuffer.trim().length > 0) {
      addRecordedLine(state.streamBuffer);
      state.streamBuffer = '';
    }

    state.isRecording = false;

    // Chiudi lo stream di file locale se attivo
    if (state.fileWritableStream) {
      await closeFileStream(); // Attende chiusura sicura del file
    }

    updateUIRecordingState();
    console.log(`[Tinkercad Serial Logger] Registrazione fermata. Totale righe: ${state.capturedLines.length}`);
  }

  function clearCapturedData() {
    state.capturedLines = [];
    state.streamBuffer = '';
    updateStatsCounter();
    clearPreview();
    // Svuota anche il monitor seriale nativo di Tinkercad (se disponibile)
    if (domSerialClear) {
      domSerialClear.click();
    }
    console.log('[Tinkercad Serial Logger] Buffer cancellato.');
  }

  // --------------------------------------------------------------------------
  // FILE SYSTEM ACCESS API (Streaming in tempo reale su disco)
  // --------------------------------------------------------------------------
  async function startFileStream() {
    if (!window.showSaveFilePicker) {
      alert('La funzione "Stream su File" (File System Access API) richiede Chrome o Edge desktop.');
      return;
    }

    try {
      const suggestedExt = state.options.delimiter === '\t' ? 'tsv' : 'csv';
      const handle = await window.showSaveFilePicker({
        suggestedName: `tinkercad_serial_${new Date().toISOString().slice(0, 10)}.${suggestedExt}`,
        types: [
          {
            description: 'File Dati Tabellari',
            accept: {
              'text/csv': ['.csv'],
              'text/plain': ['.txt', '.tsv'],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      state.fileWritableStream = writable;
      state.fileName = handle.name;
      state.isStreamingToFile = true;

      // Scrivi eventuale intestazione iniziale
      const header = buildHeaderString();
      if (header) {
        await writable.write('\uFEFF' + header + '\r\n'); // BOM UTF-8 per Excel
      } else {
        await writable.write('\uFEFF');
      }

      // Se non stiamo ancora registrando, avviamo la registrazione
      if (!state.isRecording) {
        startRecording();
      }

      updateUIRecordingState();
      console.log(`[Tinkercad Serial Logger] Stream avviato su: ${handle.name}`);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Tinkercad Serial Logger] Errore apertura file stream:', err);
        alert('Impossibile aprire il file per lo streaming: ' + err.message);
      }
    }
  }

  async function closeFileStream() {
    if (state.fileWritableStream) {
      try {
        await state.fileWritableStream.close();
      } catch (e) {
        console.error('Errore durante la chiusura del file stream:', e);
      }
      state.fileWritableStream = null;
    }
    state.isStreamingToFile = false;
    state.fileName = '';
    updateUIRecordingState();
  }

  // --------------------------------------------------------------------------
  // FORMATTAZIONE DEI DATI PER EXCEL, SCILAB E MATLAB
  // --------------------------------------------------------------------------
  function buildHeaderString() {
    const delim = state.options.delimiter;
    const parts = [];

    // Colonna Timestamp opzionale
    if (state.options.addTimestamp === 'sec') {
      parts.push('Tempo_s');
    } else if (state.options.addTimestamp === 'time') {
      parts.push('Ora');
    }

    if (state.options.customHeader && state.options.customHeader.trim()) {
      // Se l'utente ha inserito intestazioni custom, spezza e unisci con il delimitatore scelto
      const userHeaders = state.options.customHeader.split(/[,;\t]/).map(h => h.trim()).filter(Boolean);
      parts.push(...userHeaders);
      return parts.join(delim);
    } else if (parts.length > 0) {
      parts.push('Dati_Seriale');
      return parts.join(delim);
    }

    return '';
  }

  function formatRecordForExport(record) {
    const delim = state.options.delimiter;
    const parts = [];

    // 1. Timestamp
    if (state.options.addTimestamp === 'sec') {
      let t = record.elapsedSec;
      if (state.options.decimalComma && delim === ';') {
        t = t.replace('.', ',');
      }
      parts.push(t);
    } else if (state.options.addTimestamp === 'time') {
      parts.push(record.timeStr);
    }

    // 2. Dati della riga
    let lineText = record.raw;

    // Se l'utente ha scelto di adattare i dati ad Excel IT (separatore ';' e decimali con virgola ',')
    if (state.options.decimalComma && delim === ';') {
      // Sostituisce le virgole usate da Arduino come separatore con ';'
      // e poi converte i punti decimali nei numeri in virgole
      // Se la riga era es: "12.35,45.80" -> diventa "12,35;45,80"
      if (lineText.includes(',')) {
        // Ipotizziamo che le virgole originali fossero separatori tra valori
        const tokens = lineText.split(',').map(tok => {
          const trimmed = tok.trim();
          // Se è un numero con punto decimale, converti il punto in virgola
          if (/^-?\d+\.\d+$/.test(trimmed)) {
            return trimmed.replace('.', ',');
          }
          return trimmed;
        });
        lineText = tokens.join(';');
      } else {
        // Se c'è solo un valore numerico con punto: 12.35 -> 12,35
        lineText = lineText.replace(/(\b\d+)\.(\d+\b)/g, '$1,$2');
      }
    } else if (delim === ',') {
      // Formato standard CSV (Scilab / MATLAB):
      // Assicura che i campi separati da ';' o spazi diventino virgole
      if (!lineText.includes(',') && lineText.includes(';')) {
        lineText = lineText.split(';').map(t => t.trim()).join(',');
      }
    } else if (delim === '\t') {
      // Tab-separated
      if (lineText.includes(',') && !lineText.includes('\t')) {
        lineText = lineText.split(',').map(t => t.trim()).join('\t');
      } else if (lineText.includes(';') && !lineText.includes('\t')) {
        lineText = lineText.split(';').map(t => t.trim()).join('\t');
      }
    }

    parts.push(lineText);
    return parts.join(delim);
  }

  function generateFullExportText(isCsv = true) {
    if (state.capturedLines.length === 0) {
      return '';
    }

    if (!isCsv) {
      // Esportazione pura TXT grezza
      return state.capturedLines.map(r => r.raw).join('\r\n');
    }

    const lines = [];
    const header = buildHeaderString();
    if (header) {
      lines.push(header);
    }

    for (const record of state.capturedLines) {
      lines.push(formatRecordForExport(record));
    }

    return lines.join('\r\n');
  }

  // --------------------------------------------------------------------------
  // DOWNLOAD DEL FILE (CSV / TXT)
  // --------------------------------------------------------------------------
  function downloadFile(isCsv = true) {
    if (state.capturedLines.length === 0) {
      alert('Nessun dato catturato da esportare. Avvia la simulazione e la registrazione.');
      return;
    }

    const content = generateFullExportText(isCsv);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = isCsv ? (state.options.delimiter === '\t' ? 'tsv' : 'csv') : 'txt';
    const filename = `tinkercad_serial_${dateStr}.${ext}`;

    // Per Excel, aggiungiamo il BOM UTF-8 (\uFEFF) per garantire la corretta interpretazione dei caratteri
    const blobContent = isCsv ? ('\uFEFF' + content) : content;
    const mimeType = isCsv ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;';

    const blob = new Blob([blobContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`[Tinkercad Serial Logger] File scaricato: ${filename} (${state.capturedLines.length} righe)`);
  }

  // --------------------------------------------------------------------------
  // COPIA NEGLI APPUNTI
  // --------------------------------------------------------------------------
  async function copyToClipboard() {
    if (state.capturedLines.length === 0) {
      alert('Nessun dato da copiare.');
      return;
    }

    const content = generateFullExportText(true);
    try {
      await navigator.clipboard.writeText(content);
      showTemporaryToast('Copiato negli appunti! Pronto per Excel/Scilab.');
    } catch (err) {
      console.error('Errore copia negli appunti:', err);
      // Fallback legacy (execCommand deprecato ma ancora funzionante su Chrome/Edge)
      try {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        showTemporaryToast(ok ? 'Copiato negli appunti!' : '⚠️ Impossibile copiare. Usa Salva CSV.');
      } catch (e2) {
        showTemporaryToast('⚠️ Impossibile copiare negli appunti.');
      }
    }
  }

  // --------------------------------------------------------------------------
  // CREAZIONE INTERFACCIA UTENTE (WIDGET FLUTTUANTE)
  // --------------------------------------------------------------------------
  function createLoggerUI() {
    if (document.getElementById('tck-logger-container')) {
      return;
    }

    const container = document.createElement('div');
    container.id = 'tck-logger-container';

    container.innerHTML = `
      <div class="tck-logger-header" id="tck-drag-handle">
        <div class="tck-logger-title-group">
          <div class="tck-logger-logo">IO</div>
          <div style="display: flex; flex-direction: column; line-height: 1.15;">
            <span>Tinkercad Serial Logger</span>
            <span style="font-size: 9px; font-weight: normal; color: #94a3b8;">by Salvatore Strano</span>
          </div>
          <span class="tck-logger-badge tck-idle" id="tck-badge-status">INATTIVO</span>
        </div>
        <div class="tck-logger-header-actions">
          <button class="tck-icon-btn" id="tck-btn-minimize" title="Riduci a icona">−</button>
        </div>
      </div>

      <div class="tck-logger-body">
        <div class="tck-status-banner tck-waiting" id="tck-status-banner">
          <span id="tck-status-text">⏳ In attesa del Monitor Seriale...</span>
        </div>

        <div class="tck-stats-row">
          <div class="tck-stat-item">
            <span class="tck-stat-label">Righe Catturate</span>
            <span class="tck-stat-val" id="tck-stat-count">0</span>
          </div>
          <div class="tck-stat-item" style="text-align: right;">
            <span class="tck-stat-label">Tempo REC</span>
            <span class="tck-stat-val" id="tck-stat-time">00:00</span>
          </div>
        </div>

        <div class="tck-btn-group-main">
          <button class="tck-btn tck-btn-rec-start" id="tck-btn-record">
            <span>●</span> Avvia REC
          </button>
          <button class="tck-btn tck-btn-stream" id="tck-btn-stream" title="Salva in tempo reale su un file con finestra Salva">
            <span>🔴</span> Stream File...
          </button>
        </div>

        <div class="tck-export-row">
          <button class="tck-btn tck-btn-secondary" id="tck-btn-save-csv" title="Esporta file per Excel o Scilab">
            💾 Salva CSV
          </button>
          <button class="tck-btn tck-btn-secondary" id="tck-btn-save-txt" title="Esporta log di testo grezzo">
            📄 Salva TXT
          </button>
          <button class="tck-btn tck-btn-secondary" id="tck-btn-copy" title="Copia negli appunti">
            📋 Copia
          </button>
        </div>

        <!-- Terminalino di anteprima -->
        <div class="tck-preview-box" id="tck-preview-box">
          <div class="tck-preview-placeholder">I dati del monitor seriale appariranno qui...</div>
        </div>

        <!-- Opzioni per Excel / Scilab -->
        <div class="tck-settings-panel">
          <div class="tck-settings-toggle" id="tck-toggle-settings">
            <span>⚙️ <b>Impostazioni Excel & Scilab</b></span>
            <span id="tck-settings-arrow">▼</span>
          </div>
          <div id="tck-settings-content" style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
            <div class="tck-field">
              <label class="tck-field-label">
                <span>Separatore Colonne:</span>
              </label>
              <select class="tck-select" id="tck-opt-delim">
                <option value=";">Punto e virgola ( ; ) - Excel Italiano</option>
                <option value=",">Virgola ( , ) - Scilab / MATLAB / US</option>
                <option value="&#9;">Tabulazione ( TSV )</option>
              </select>
            </div>

            <div class="tck-field">
              <label class="tck-field-label">
                <span>Colonna Timestamp:</span>
              </label>
              <select class="tck-select" id="tck-opt-timestamp">
                <option value="sec">Tempo Relativo in secondi (0.000 s)</option>
                <option value="time">Ora esatta (HH:MM:SS)</option>
                <option value="none">Nessuno (Solo dati Arduino)</option>
              </select>
            </div>

            <div class="tck-field">
              <label class="tck-field-label">Intestazione Colonne (opzionale):</label>
              <input type="text" class="tck-input" id="tck-opt-header" placeholder="es. Tempo;Sensore1;Sensore2" />
            </div>

            <label class="tck-checkbox-row">
              <input type="checkbox" id="tck-opt-decimal-comma" checked />
              <span>Converti decimali da '.' a ',' per Excel IT</span>
            </label>

            <label class="tck-checkbox-row">
              <input type="checkbox" id="tck-opt-auto-sim" checked />
              <span>Avvia REC automaticamente all'avvio simulazione</span>
            </label>

            <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
              <button class="tck-btn tck-btn-tertiary" id="tck-btn-reset-buffer">🗑️ Svuota Dati</button>
            </div>
          </div>
        </div>

        <div style="text-align: center; font-size: 10px; color: #64748b; padding-top: 4px; border-top: 1px solid #1e293b;">
          © 2026 <b>Salvatore Strano</b> • Tool Didattico per Scuole e Privati
        </div>
      </div>
    `;

    // Bottone Pill compresso
    const pill = document.createElement('button');
    pill.id = 'tck-pill-btn';
    pill.className = 'tck-pill-btn';
    pill.innerHTML = `<span>📊</span> Serial Logger - S. Strano (<span id="tck-pill-count">0</span>)`;
    pill.onclick = () => {
      container.classList.remove('tck-minimized');
      pill.style.display = 'none';
      container.style.display = 'flex';
    };

    // S2: Ripristina posizione widget salvata in precedenza
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['tck_widget_pos'], (res) => {
        if (res && res.tck_widget_pos) {
          container.style.bottom = 'auto';
          container.style.right = 'auto';
          container.style.left = res.tck_widget_pos.left;
          container.style.top = res.tck_widget_pos.top;
        }
      });
    }

    document.body.appendChild(container);
    document.body.appendChild(pill);

    // Event Listeners UI
    bindUIEvents(container, pill);
    applyOptionsToUI();
  }

  function bindUIEvents(container, pill) {
    const btnRecord = document.getElementById('tck-btn-record');
    const btnStream = document.getElementById('tck-btn-stream');
    const btnSaveCsv = document.getElementById('tck-btn-save-csv');
    const btnSaveTxt = document.getElementById('tck-btn-save-txt');
    const btnCopy = document.getElementById('tck-btn-copy');
    const btnReset = document.getElementById('tck-btn-reset-buffer');
    const btnMinimize = document.getElementById('tck-btn-minimize');

    btnRecord.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    btnStream.addEventListener('click', () => {
      if (state.isStreamingToFile) {
        closeFileStream();
      } else {
        startFileStream();
      }
    });

    btnSaveCsv.addEventListener('click', () => downloadFile(true));
    btnSaveTxt.addEventListener('click', () => downloadFile(false));
    btnCopy.addEventListener('click', () => copyToClipboard());
    btnReset.addEventListener('click', () => {
      if (confirm('Vuoi davvero cancellare tutte le righe catturate?')) {
        clearCapturedData();
      }
    });

    btnMinimize.addEventListener('click', () => {
      container.style.display = 'none';
      pill.style.display = 'inline-flex';
    });

    // Toggle pannello impostazioni
    const toggleSettings = document.getElementById('tck-toggle-settings');
    const settingsContent = document.getElementById('tck-settings-content');
    const settingsArrow = document.getElementById('tck-settings-arrow');
    let settingsOpen = true;
    toggleSettings.addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      settingsContent.style.display = settingsOpen ? 'flex' : 'none';
      settingsArrow.textContent = settingsOpen ? '▼' : '▶';
    });

    // Modifica opzioni
    const optDelim = document.getElementById('tck-opt-delim');
    const optTimestamp = document.getElementById('tck-opt-timestamp');
    const optHeader = document.getElementById('tck-opt-header');
    const optDecimal = document.getElementById('tck-opt-decimal-comma');
    const optAutoSim = document.getElementById('tck-opt-auto-sim');

    const saveOptions = () => {
      state.options.delimiter = optDelim.value;
      state.options.addTimestamp = optTimestamp.value;
      state.options.customHeader = optHeader.value;
      state.options.decimalComma = optDecimal.checked;
      state.options.autoRecordOnSim = optAutoSim.checked;

      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ tck_options: state.options });
      }
    };

    optDelim.addEventListener('change', saveOptions);
    optTimestamp.addEventListener('change', saveOptions);
    // I3: debounce evita chiamate continue a chrome.storage ad ogni tasto
    let _saveHeaderTimer;
    optHeader.addEventListener('input', () => {
      clearTimeout(_saveHeaderTimer);
      _saveHeaderTimer = setTimeout(saveOptions, 500);
    });
    optDecimal.addEventListener('change', saveOptions);
    optAutoSim.addEventListener('change', saveOptions);

    // Trascinamento (Draggable)
    makeDraggable(container, container);
  }

  function applyOptionsToUI() {
    const optDelim = document.getElementById('tck-opt-delim');
    const optTimestamp = document.getElementById('tck-opt-timestamp');
    const optHeader = document.getElementById('tck-opt-header');
    const optDecimal = document.getElementById('tck-opt-decimal-comma');
    const optAutoSim = document.getElementById('tck-opt-auto-sim');

    if (optDelim) optDelim.value = state.options.delimiter;
    if (optTimestamp) optTimestamp.value = state.options.addTimestamp;
    if (optHeader) optHeader.value = state.options.customHeader;
    if (optDecimal) optDecimal.checked = state.options.decimalComma;
    if (optAutoSim) optAutoSim.checked = state.options.autoRecordOnSim;
  }

  function updateStatusBanner(connected) {
    const banner = document.getElementById('tck-status-banner');
    const text = document.getElementById('tck-status-text');
    if (!banner || !text) return;

    if (connected) {
      banner.className = 'tck-status-banner tck-connected';
      text.textContent = '🟢 Monitor Seriale Connesso';
    } else {
      banner.className = 'tck-status-banner tck-waiting';
      text.textContent = '⏳ Apri "Codice" -> "Monitor Seriale"';
    }
  }

  function updateUIRecordingState() {
    const btnRecord = document.getElementById('tck-btn-record');
    const btnStream = document.getElementById('tck-btn-stream');
    const badge = document.getElementById('tck-badge-status');
    const pill = document.getElementById('tck-pill-btn');

    if (state.isRecording) {
      if (badge) {
        badge.className = state.isStreamingToFile ? 'tck-logger-badge tck-stream' : 'tck-logger-badge tck-rec';
        badge.textContent = state.isStreamingToFile ? 'STREAM FILE' : 'REC IN CORSO';
      }
      if (btnRecord) {
        btnRecord.className = 'tck-btn tck-btn-rec-stop';
        btnRecord.innerHTML = '<span>■</span> Interrompi REC';
      }
      if (pill) {
        pill.classList.add('tck-pill-rec');
      }
    } else {
      if (badge) {
        badge.className = 'tck-logger-badge tck-idle';
        badge.textContent = 'INATTIVO';
      }
      if (btnRecord) {
        btnRecord.className = 'tck-btn tck-btn-rec-start';
        btnRecord.innerHTML = '<span>●</span> Avvia REC';
      }
      if (pill) {
        pill.classList.remove('tck-pill-rec');
      }
    }

    if (btnStream) {
      if (state.isStreamingToFile) {
        btnStream.style.background = '#059669';
        btnStream.innerHTML = `<span>💾</span> File: ${state.fileName.slice(0, 10)}...`;
      } else {
        btnStream.style.background = '';
        btnStream.innerHTML = '<span>🔴</span> Stream File...';
      }
    }
  }

  function updateStatsCounter() {
    const countEl = document.getElementById('tck-stat-count');
    const pillCountEl = document.getElementById('tck-pill-count');
    if (countEl) countEl.textContent = state.capturedLines.length;
    if (pillCountEl) pillCountEl.textContent = state.capturedLines.length;
  }

  // Timer di registrazione (C1: riferimento salvato per cleanup su unload)
  const _recTimerInterval = setInterval(() => {
    if (state.isRecording && state.recordingStartTime > 0) {
      const elapsedSec = Math.floor((performance.now() - state.recordingStartTime) / 1000);
      const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      const timeEl = document.getElementById('tck-stat-time');
      if (timeEl) timeEl.textContent = `${mins}:${secs}`;
    }
  }, 500);

  function addPreviewLine(record) {
    const box = document.getElementById('tck-preview-box');
    if (!box) return;

    // Rimuovi placeholder iniziale
    const placeholder = box.querySelector('.tck-preview-placeholder');
    if (placeholder) {
      box.removeChild(placeholder);
    }

    const lineEl = document.createElement('div');
    lineEl.className = 'tck-preview-line';
    lineEl.textContent = `[#${record.index} | +${record.elapsedSec}s] ${record.raw}`;
    box.appendChild(lineEl);

    // Mantieni solo le ultime 20 righe a schermo
    while (box.children.length > 20) {
      box.removeChild(box.firstChild);
    }

    // Auto-scroll in fondo
    box.scrollTop = box.scrollHeight;
  }

  function clearPreview() {
    const box = document.getElementById('tck-preview-box');
    if (!box) return;
    box.innerHTML = '<div class="tck-preview-placeholder">I dati del monitor seriale appariranno qui...</div>';
  }

  function showTemporaryToast(msg) {
    const banner = document.getElementById('tck-status-banner');
    const text = document.getElementById('tck-status-text');
    if (!banner || !text) return;
    const oldText = text.textContent;
    const oldClass = banner.className;

    banner.className = 'tck-status-banner tck-connected';
    text.textContent = '✨ ' + msg;

    setTimeout(() => {
      text.textContent = oldText;
      banner.className = oldClass;
    }, 2500);
  }

  // --------------------------------------------------------------------------
  // LOGICA DI DRAG & DROP PER IL WIDGET
  // --------------------------------------------------------------------------
  function makeDraggable(container, handle) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    // M6: line endings CRLF uniformi
    // Elementi interattivi: non avviare il drag se si clicca su di essi
    const DRAG_EXCLUDE = 'button, input, select, textarea, a, label, [role="button"]';

    handle.style.cursor = 'grab';

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest(DRAG_EXCLUDE)) return;
      isDragging = true;
      handle.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = `${initialLeft}px`;
      container.style.top = `${initialTop}px`;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = Math.max(10, Math.min(window.innerWidth - container.offsetWidth - 10, initialLeft + dx));
      let newTop = Math.max(10, Math.min(window.innerHeight - container.offsetHeight - 10, initialTop + dy));
      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      isDragging = false;
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // S2b: salva posizione per ripristinarla al prossimo caricamento
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          tck_widget_pos: { left: container.style.left, top: container.style.top }
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // MESSAGGI DALL'EXTENSION POPUP
  // --------------------------------------------------------------------------
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'GET_STATUS':
          sendResponse({
            isConnected: state.isConnected,
            isRecording: state.isRecording,
            isSimulationActive: state.isSimulationActive,
            count: state.capturedLines.length,
          });
          break;
        case 'START_RECORDING':
          startRecording();
          sendResponse({ success: true });
          break;
        case 'STOP_RECORDING':
          stopRecording();
          sendResponse({ success: true, count: state.capturedLines.length });
          break;
        case 'DOWNLOAD_CSV':
          downloadFile(true);
          sendResponse({ success: true });
          break;
        case 'DOWNLOAD_TXT':
          downloadFile(false);
          sendResponse({ success: true });
          break;
        case 'CLEAR_BUFFER':
          clearCapturedData();
          sendResponse({ success: true });
          break;
        case 'SHOW_WIDGET': {
          const widgetContainer = document.getElementById('tck-logger-container');
          const widgetPill = document.getElementById('tck-pill-btn');
          if (widgetContainer) {
            widgetContainer.style.display = 'flex';
            widgetContainer.classList.remove('tck-minimized');
          }
          if (widgetPill) {
            widgetPill.style.display = 'none';
          }
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ error: 'Azione sconosciuta' });
      }
      return true;
    });
  }

  // --------------------------------------------------------------------------
  // AVVIO
  // --------------------------------------------------------------------------
  createLoggerUI();

  // Scansione ciclica ogni 600ms per rilevare l'apertura/chiusura del pannello seriale
  const _scanInterval = setInterval(findTinkercadElements, 600);

  // C1: Pulizia risorse su unload — evita memory leak su navigazione interna
  window.addEventListener('pagehide', () => {
    clearInterval(_recTimerInterval);
    clearInterval(_scanInterval);
    if (serialObserver) serialObserver.disconnect();
    if (state.fileWritableStream) closeFileStream();
  });

  console.log('[Tinkercad Serial Logger] Widget caricato con successo.');
})();

