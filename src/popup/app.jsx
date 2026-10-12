import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [filePath, setFilePath] = useState('');
  
  // Utilizziamo un riferimento (ref) per mantenere l'accesso allo stream di scrittura tra i vari render di React
  const fileWritableStreamRef = useRef(null);

  // 1. Funzione per chiedere all'utente dove salvare il file (Seleziona Percorso)
  const handleSelectPath = async () => {
    try {
      // Mostra la finestra nativa di Edge per salvare il file
      const handle = await window.showSaveFilePicker({
        suggestedName: 'tinkercad_serial_log.txt',
        types: [{
          description: 'File di testo',
          accept: { 'text/plain': ['.txt'] },
        }],
      });

      // Crea lo stream di scrittura sul file selezionato
      const writable = await handle.createWritable();
      fileWritableStreamRef.current = writable;
      
      // Salva il nome del file nello stato per mostrarlo nell'interfaccia
      setFilePath(handle.name);
      setIsRecording(true);
      console.log("File pronto per la scrittura locale.");
    } catch (err) {
      console.error("Scelta del percorso annullata o non riuscita:", err);
    }
  };

  // 2. Ascolta i dati provenienti dall'estensione Tinkercad
  useEffect(() => {
    const handleExtensionMessages = async (event) => {
      // Filtra i messaggi assicurandoti che arrivino dal nostro content.js e che stiamo registrando
      if (event.data && event.data.type === "TINKERCAD_SERIAL_DATA" && isRecording && fileWritableStreamRef.current) {
        try {
          // Scrive il singolo dato catturato direttamente nel file sul PC
          await fileWritableStreamRef.current.write(event.data.data);
        } catch (error) {
          console.error("Errore durante la scrittura sul file:", error);
        }
      }
    };

    window.addEventListener("message", handleExtensionMessages);
    return () => window.removeEventListener("message", handleExtensionMessages);
  }, [isRecording]);

  // 3. Funzione per interrompere la registrazione e chiudere il file correttamente
  const handleStopRecording = async () => {
    if (fileWritableStreamRef.current) {
      await fileWritableStreamRef.current.close(); // Salva definitivamente i dati su disco
      fileWritableStreamRef.current = null;
    }
    setIsRecording(false);
    setFilePath('');
    alert("File salvato e chiuso correttamente!");
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Tinkercad Data Logger</h1>
      <p style={{ color: '#666', fontSize: '13px', marginTop: '-5px' }}>
        Tool Didattico per Scuole e Privati • Autore: <b>Salvatore Strano</b>
      </p>      <div style={{ margin: '20px 0' }}>
        {!isRecording ? (
          <button onClick={handleSelectPath} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
            Seleziona Percorso e Avvia Salvataggio
          </button>
        ) : (
          <div>
            <p style={{ color: 'green', fontWeight: 'bold' }}>
              🔴 Registrazione in corso nel file: {filePath}
            </p>
            <button onClick={handleStopRecording} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#ff4d4d', color: 'white', border: 'none' }}>
              Interrompi e Salva File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
