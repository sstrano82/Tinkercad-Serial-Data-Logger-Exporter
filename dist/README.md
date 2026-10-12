# Tinkercad Serial Data Logger & Exporter 📊

Estensione per **Google Chrome** e **Microsoft Edge** (Manifest V3) per catturare in tempo reale tutto lo stream seriale in uscita del simulatore Arduino su **Autodesk Tinkercad Circuits** ed esportarlo in file di testo (**CSV** e **TXT**) pronti per l'elaborazione con **Microsoft Excel**, **Scilab** e **MATLAB**.

---

## 🚀 Caratteristiche Principali

- **Cattura Automatica dello Stream Seriale**: Monitora il DOM del monitor seriale di Tinkercad senza alterare la grafica originale o rallentare la simulazione.
- **Widget Integrato e Trascinabile in Tinkercad**:
  - Non si chiude accidentalmente durante l'uso del circuito (a differenza dei classici popup del browser).
  - Mostra lo stato di connessione al monitor seriale, il contatore delle righe in tempo reale e il tempo trascorso.
  - Può essere ridotto a icona (modalità pill) o spostato in qualsiasi punto dello schermo.
- **Doppia Modalità di Salvataggio**:
  1. **Download Istantaneo (CSV o TXT)**: Salva con un click tutti i dati accumulati durante la prova (con BOM UTF-8 per la massima compatibilità con Excel).
  2. **Live File Stream (File System Access API)**: Apre la finestra nativa di salvataggio del sistema operativo e scrive i dati su disco *in tempo reale* man mano che Arduino li produce.
- **Formattazione Ottimizzata per Excel e Scilab**:
  - **Separatore Colonne a scelta**: Punto e virgola (`;`) per Excel Italiano, Virgola (`,`) per Scilab/MATLAB/Python, oppure Tabulazione (TSV).
  - **Adattamento Decimali per Excel IT**: Converte automaticamente i punti decimali (`12.35`) in virgole (`12,35`), così Excel riconosce subito i numeri senza formule di conversione.
  - **Colonna Timestamp Opzionale**: Aggiunge automaticamente il tempo relativo in secondi (`0.000 s`) ad alta precisione o l'orario reale.
  - **Intestazione Colonne Personalizzabile**: Possibilità di definire i nomi delle colonne (es. `Tempo;Temperatura;Luminosita`).
- **Copia rapida negli Appunti (Clipboard)**: Per incollare al volo i dati direttamente dentro un foglio di calcolo o in console Scilab.
- **Pronta all'uso senza dipendenze**: Scritta in JavaScript puro (ES6+), non richiede alcuna compilazione né l'installazione di Node.js o pacchetti esterni.

---

## 📦 Come Installare l'Estensione nel Browser

L'estensione supporta sia **Google Chrome** che **Microsoft Edge**:

1. Apri il browser e vai alla pagina delle estensioni:
   - Su **Chrome**: digita nella barra degli indirizzi `chrome://extensions/` e premi Invio.
   - Su **Edge**: digita nella barra degli indirizzi `edge://extensions/` e premi Invio.
2. In alto a destra, attiva la voce **"Modalità sviluppatore"** (Developer mode).
3. Clicca sul pulsante **"Carica estensione non pacchettizzata"** (Load unpacked).
4. Seleziona la cartella del progetto (oppure la cartella `dist`).
5. L'estensione risulterà ora installata e attiva!

---

## 🛠️ Come Utilizzarla su Tinkercad

1. Apri qualsiasi progetto di circuito su [Tinkercad Circuits](https://www.tinkercad.com/circuits).
2. Noterai comparire in basso a destra il pannello **Tinkercad Serial Logger**.
3. Clicca su **"Codice"** e apri il **"Monitor Seriale"** in basso. Lo stato del widget diventerà:
   `🟢 Monitor Seriale Connesso`.
4. Clicca su **"Avvia simulazione"** in Tinkercad:
   - Se l'opzione *"Avvia REC automaticamente all'avvio simulazione"* è attiva, la registrazione partirà da sola!
   - Altrimenti premi il tasto **"● Avvia REC"**.
5. Al termine della simulazione (o quando hai raccolto i campioni desiderati):
   - Clicca su **"💾 Salva CSV"** per scaricare il file formattato.
   - Oppure su **"📄 Salva TXT"** per il testo grezzo.
   - Oppure su **"📋 Copia"** per incollare subito i dati.

---

## 💻 Esempio di Codice Arduino

Per generare dati puliti e ben formattati per Excel o Scilab, è consigliabile stampare i valori separati da virgola e terminare la riga con `Serial.println()`:

```cpp
// Esempio: Acquisizione di due canali analogici (A0 e A1) con tempo
void setup() {
  Serial.begin(9600);
}

void loop() {
  // Lettura sensori
  int valA0 = analogRead(A0);
  int valA1 = analogRead(A1);

  // Conversione in tensione (0 - 5V)
  float voltA0 = valA0 * (5.0 / 1023.0);
  float voltA1 = valA1 * (5.0 / 1023.0);

  // Stampa in formato CSV: Valore1,Valore2
  Serial.print(voltA0);
  Serial.print(",");
  Serial.println(voltA1);

  delay(100); // Frequenza di campionamento ~10 Hz
}
```

---

## 📈 Elaborazione dei Dati

### 1. In Microsoft Excel (Italiano)
- Nel widget dell'estensione, lascia selezionato:
  - **Separatore Colonne**: `Punto e virgola ( ; )`
  - **Converti decimali da '.' a ','**: `Spuntato`
  - **Intestazione**: es. `Tensione_A0;Tensione_A1`
- Scarica il file CSV.
- Facendo doppio click sul file `.csv`, Excel lo aprirà direttamente disponendo i valori nelle rispettive colonne e riconoscendo subito i numeri per creare grafici a dispersione o a linee.

### 2. In Scilab
- Nel widget dell'estensione seleziona:
  - **Separatore Colonne**: `Virgola ( , )`
  - **Converti decimali**: `Deselezionato` (Scilab richiede il punto decimale `.` standard internazionale).
- In Scilab puoi caricare la matrice con un solo comando:
```scilab
// Carica il file CSV nella matrice 'dati'
dati = csvRead("tinkercad_serial.csv", ",");

// Supponiamo che la colonna 1 sia il Tempo e la colonna 2 sia il Valore
tempo   = dati(:, 1);
tensione = dati(:, 2);

// Grafico
plot(tempo, tensione, "b-");
xtitle("Acquisizione Dati Arduino Tinkercad", "Tempo [s]", "Tensione [V]");
xgrid();
```

---

## 📂 Struttura dei File del Progetto

```
tinkercad-web-bridge-master/
├── manifest.json              # File di configurazione dell'estensione Manifest V3
├── icons/                     # Icone dell'estensione (16x16, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── content/
│   │   ├── content.js         # Script principale iniettato in Tinkercad (cattura stream e UI)
│   │   └── content.css        # Grafica dark-mode del widget fluttuante
│   └── popup/
│       ├── popup.html         # Finestra popup dell'estensione
│       ├── popup.js           # Logica di controllo del popup
│       └── popup.css          # Stile della finestra popup
├── LICENSE                    # Licenza e copyright
└── README.md                  # Questa guida
```

---

## 🎓 Finalità Didattica & Progetto

Questo software nasce come **strumento didattico open per scuole, istituti tecnici, docenti, studenti e privati** che desiderano acquisire, analizzare e scambiare dati in tempo reale tra le simulazioni virtuali di **Arduino su Autodesk Tinkercad** e i principali ambienti di calcolo numerico e fogli di calcolo (**Microsoft Excel**, **Scilab**, **MATLAB**, **Python/Pandas**).

È particolarmente indicato per:
- Laboratori scolastici di elettronica, informatica e telecomunicazioni.
- Esperienze didattiche di acquisizione dati da sensori virtuali (temperatura, luminosità, potenziometri, accelerometri).
- Studio sperimentale e tracciamento di curve caratteristiche, risposta al gradino di circuiti RC/RL e filtraggio digitale dei segnali.

---

## ⚖️ Autore & Copyright

- **Ideato e Realizzato da:** **Salvatore Strano**
- **Copyright:** © 2026 **Salvatore Strano**. Tutti i diritti riservati.
- **Licenza:** Rilasciato per scopi didattici, educativi e formativi.

