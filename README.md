# Capitula Viewer

Applicazione web per consultare edizioni critiche digitali dei *capitula* biblici codificate in XML-TEI (segmentazione parallela), sviluppata per le edizioni del progetto PRIN DOBiPS – *Data Oriented Biblical Paratext Studies* (Università di Udine e Cassino) e riutilizzabile per altre serie di capitula.

Usa solo HTML, CSS e JavaScript, senza librerie, server o database. Legge direttamente il file TEI nel browser e si pubblica su GitHub Pages insieme agli XML.

## Cosa fa 

| Problema incontrato con EVT 2 (working paper, Zenodo 16761174) | Soluzione nel viewer |
|---|---|
| Gli strati correttori (`@varSeq`) sono visibili solo uno alla volta, nell'apparato | Ogni correzione viene mostrata come sequenza: *a.c.* → *p.c.*, con mano (`@hand`), modalità (`@rend`) e classificazione. La scheda **Analysis → Corrections** elenca tutte le correzioni per testimone e per mano |
| Testo critico e visualizzazione dei testimoni sono incompatibili | **Witness view**: qualsiasi testimone si legge ricostruito dall'apparato, *prima mano* o *stato finale*, con le divergenze dal testo critico sottolineate e i passi corretti segnati |
| Nell'apparato positivo un testimone lacunoso finisce tra i testimoni del lemma; lo stesso succede nelle varianti annidate | I testimoni del lemma vengono calcolati: sono esclusi quelli lacunosi nel capitolo (`@cause="lacuna"`) e quelli che, in un `<app>` che contiene questo, hanno una lezione diversa del passo più ampio. Se il `lem/@wit` esplicito non coincide con il calcolo, la scheda **Encoding check** lo segnala |
| Nella modalità critica testo e immagine non sono collegati | I `<pb>` vengono letti per testimone: ogni capitulum indica il foglio su cui si trova in ciascun manoscritto e l'immagine si apre accanto al testo. Con **follow the text** la pagina cambia da sola quando passi a un altro capitulum. Con **compare** si vedono due testimoni affiancati sullo stesso capitolo |
| `@type` / `@cause` / `@subtype` restano visibili solo nell'XML | Compaiono come etichette nell'apparato, si possono evidenziare nel testo (*Display → Highlight cause*) e vengono usate nelle statistiche |
| Annotazioni “Φ (adiaph.) vs Am1 Tu” come pallini rossi | Diventano etichette leggibili accanto alla lezione (attivabili/disattivabili). La scheda **Analysis → Φ profile** ricava dalla codifica la tabella delle innovazioni Φ (esclusive, condivise con Am1 o con Tu) e mostra le lezioni dei comparanda |
| Ancoraggi biblici (`<ref type="parallelPassage">`) | Mostrati come riferimento (es. *Gn 1:1*) con link al testo della Vulgata; anche i riferimenti biblici nelle note critiche diventano link |

Altre funzioni:

- **Visualizzatore delle immagini**: pannello agganciato al testo e ridimensionabile, zoom con rotella o doppio clic, trascinamento, rotazione, miniature delle pagine, schermo intero, regolazione di luminosità e contrasto, scala di grigi e negativo (utili per le rubriche sbiadite). In ogni immagine una didascalia indica se il capitulum selezionato è su quella pagina o su un'altra. Ci sono link al facsimile completo, al manifest IIIF e a Mirador. Tastiera: `+` `−` `0` per lo zoom, `[` `]` per cambiare pagina, `r` per ruotare.

- **Agreements**: matrice delle concordanze tra testimoni, sia come innovazioni condivise rispetto al testo sia come percentuale di accordo. Si possono escludere le varianti ortografiche e i numeri di capitolo; cliccando una cella si vedono le lezioni condivise.
- **Witness profiles**: per ogni testimone, il numero di divergenze, di lezioni singolari e di correzioni, suddivise per `@cause`.
- **Numbering**: concordanza della numerazione dei capitoli (es. Sg1 e P8, con le correzioni).
- **Proximity**: distanze tra i testimoni calcolate dall'apparato (quota di voci in cui due testimoni leggono diversamente), disegnate come albero *neighbour-joining* (senza radice) e come mappa (*multidimensional scaling*). Le lezioni classificate come errore (`@subtype="error"`) possono pesare di più degli adiafori. Si può lavorare su un solo libro o su tutto l'Ottateuco, sulla prima mano, sullo stato finale o su entrambi (lo stato corretto diventa un testimone a sé, "Sg1 p.c.", utile per la contaminazione), ed escludere singoli testimoni. È una misura di **prossimità, non uno stemma**. Esportazione in NEXUS (matrice dei caratteri + distanze, per SplitsTree o PAUP), Newick e CSV.
- **Octateuch**: profilo di ogni testimone libro per libro (divergenze, lezioni singolari, correzioni, lacune ogni 100 voci), per vedere se un manoscritto cambia comportamento da un libro all'altro.
- **Testo biblico**: per i capitula con ancoraggio biblico, il pannello dell'apparato mostra i versetti corrispondenti, dal versetto d'ancoraggio a quello che precede l'ancoraggio successivo. La fonte si configura in `js/config.js`: un servizio web (preimpostata la Vulgata Clementina di bible-api.com, che **non** è la Vulgata critica) o un file JSON locale (per esempio per la *Vetus Latina*).
- **Zone sulle immagini**: se il TEI contiene `<facsimile>/<surface>/<zone>`, l'area del capitulum selezionato viene contornata sull'immagine (tratto spesso; le altre zone tratteggiate) e il pulsante **cap.** la ingrandisce. Con **✎** si disegna l'area a mano: il viewer scrive il TEI da incollare nel file (menu **zones** → *copy TEI*). Le zone disegnate restano nel browser finché non vengono copiate nel TEI.
- **Witnesses**: cronologia dei testimoni (dai `origDate`) e schede con identificatori (Biblissima, TM, Bischoff, ARCA), facsimili, manifest IIIF e link per aprirli in Mirador.
- **Encoding check**: controlli automatici sull'XML (riferimenti `#`, vocabolari di `@type`/`@cause` confrontati con il working paper, `lem/@wit`, letture duplicate, `@varSeq`, `<pb>`, date) e verifica che tutte le immagini si carichino.
- **Data**: esportazione dell'apparato in CSV, dei testi dei testimoni in TXT, del modello in JSON, del report di controllo, e stampa dell'edizione con apparato negativo, impaginata per il bianco e nero.
- **Link a un passo**: l'indirizzo nel browser cambia con il capitulum, la voce d'apparato e il testimone selezionati (es. `#c=40&app=a120&wit=Sg1`). Si può copiare in una slide.
- Ricerca nel testo, nelle lezioni e nelle note; navigazione con ← →.
- Il significato non è mai affidato solo al colore (grassetto, corsivo, simboli), quindi tutto funziona anche in bianco e nero.

## Struttura

```
index.html          pagina dell'applicazione
css/style.css       stile (anche per la stampa)
js/config.js        CONFIGURAZIONE: edizioni, immagini, gruppi di testimoni
js/tei-model.js     lettura del TEI → modello dati + controlli di codifica
js/analysis.js      analisi (concordanze, profili, numerazione, correzioni)
js/proximity.js     distanze, albero neighbour-joining, mappa MDS, esportazione NEXUS/Newick
js/app.js           interfaccia
js/viewer.js        visualizzatore delle immagini
tei/*.xml           le edizioni (Genesi–Rut, dai file del repository DOBIPS)
```

## Pubblicare su GitHub Pages

1. Copia nella radice del repository (per esempio `TEI_viewer`, sostituendo i file attuali) il **contenuto** di questa cartella, mantenendo le sottocartelle `css/`, `js/`, `tei/`.
2. Nel repository: **Settings → Pages → Build and deployment → Deploy from a branch**, scegli `main` e `/ (root)`, poi **Save**.
3. Dopo uno o due minuti il sito è all'indirizzo `https://<utente>.github.io/<repository>/` (per esempio `https://emanuelacol.github.io/TEI_viewer/`).

Per provarlo in locale serve un piccolo server, perché i browser bloccano la lettura dei file aperti direttamente dal disco. Puoi usare VS Code con *Live Server* oppure, dalla cartella, `python3 -m http.server` e poi aprire `http://localhost:8000`. In alternativa apri `index.html` dal disco e carica l'XML con **Open XML…**.

## Cambiare o aggiungere un'edizione

- **Dal browser:** con **Open XML…**, oppure trascinando un file `.xml` sulla pagina. Il file resta nel tuo computer e non viene caricato da nessuna parte.
- **Dall'indirizzo:** `?edition=genesis` apre un'edizione configurata; `?xml=tei/miofile.xml&images=https://…/` apre un file qualsiasi.
- **In modo permanente:** metti il file in `tei/` e aggiungi una riga in `js/config.js`:

```js
{ id: "numeri", label: "Numeri", file: "tei/numeri.xml",
  imageBase: "https://ai4ch-uniud.github.io/DOBIPS/Turon_Numeri/" },
```

### Immagini

Il percorso di ogni immagine è `imageBase` + il valore di `<pb facs="…">`. Per le edizioni DOBiPS `imageBase` punta alle cartelle già pubblicate su `ai4ch-uniud.github.io/DOBIPS/`, quindi le immagini non vanno copiate. Se un'immagine non si trova al percorso indicato da `@facs`, il viewer la cerca anche nella cartella base. Se non la trova nemmeno lì, mostra il link al facsimile digitale della biblioteca.

**Per una conferenza senza rete affidabile**, copia le immagini in una cartella locale (per esempio `images/exodus/data/images/single/…`) e imposta `imageBase: "images/exodus/"`.

### Gruppi di testimoni (Φ) e comparanda

In `js/config.js`:

- `comparanda`: testimoni collazionati per confronto, fuori dal gruppo (Am1, Am2, Tu);
- `group`: nome e sigla del gruppo (Φ). Ne fanno parte tutti gli altri manoscritti. I testimoni senza `<msDesc>`, come l'edizione di de Bruyne, sono trattati come edizioni a stampa.

Se nel TEI ci sono `<listWit xml:id="…">` annidate, il viewer usa quelle.

### Zone (collegamento testo–immagine)

```xml
<facsimile>
  <surface xml:id="surf_Tu_73r">
    <graphic url="data/images/single/Tu_73r.jpg"/>   <!-- stesso file del <pb facs> -->
    <zone xml:id="zone_Tu_73r_I" n="I" ulx="100" uly="180" lrx="900" lry="300"/>
  </surface>
</facsimile>
```

La zona si collega al capitulum con `@n` (numero del capitulum nel testo critico, oppure `incipit`/`explicit`), con `@corresp="#id-dell-item"` o con `item/@facs="#id-della-zona"`. Le coordinate sono pixel del file immagine; si può usare anche `@points`.

## Convenzioni TEI che il viewer legge

- `teiHeader`: `titleStmt/title`, `editionStmt`, `publicationStmt` (mostrato nell'introduzione), `listBibl/bibl[@xml:id]`, `listWit/witness` con `msDesc` (identificativi, `origDate/@from-custom @to-custom`, `origPlace`, `recordHist/source`, `surrogates/bibl[@type]/ref`), `tagsDecl/rendition` (mani `m`, `l`, `u`; tipi di scrittura e colori delle rubriche).
- `front`: introduzione.
- `body`: `head` (incipit), `list/item` (capitula: `num`, `title`), `item` senza `num` = intertitolo di sezione (es. *Incipiunt plagae Aegypti*), `item` con sola `rdg` = capitulum aggiunto da un testimone, `trailer` (explicit), `pb[@facs]`.
- Apparato: `app` (anche annidati), `lem[@wit]`, `rdg` / `rdgGrp` con `@wit @type @subtype @cause @hand @rend @varSeq @cert @ana @rendition`, `note` (critiche; quelle che cominciano con “Φ” o contengono “vs” sono annotazioni di relazione), `witDetail`, `hi[@rend=bold|italic]`, `ref[@type=parallelPassage]`.

## Limiti noti

- La segmentazione in `<app>` minimi (scelta per EVT) resta: le concordanze sono calcolate per voce d'apparato e non per unità sintattiche più ampie.
- Le annotazioni “Φ … vs …” vengono interpretate con semplici regole testuali (errore/adiaforo, testimoni nominati). Una codifica strutturata, per esempio `@ana` sul `lem`, sarebbe più robusta.
- Senza `<zone>` nel TEI il collegamento tra testo e immagine è per foglio. Le zone si possono disegnare nel viewer; l'importazione delle righe ALTO/PAGE prodotte da eScriptorium o Transkribus non è ancora prevista.
- Proximity: i testimoni vicini al testo critico tendono a raggrupparsi tra loro anche solo per lezioni conservate (non innovazioni condivise); l'albero va letto con le liste delle concordanze (scheda *Agreements*).
- Il testo biblico da un servizio web richiede la connessione; per la conferenza conviene un file JSON locale.

Licenza: da definire (si suggerisce CC BY 4.0 per i dati e MIT per il codice).
