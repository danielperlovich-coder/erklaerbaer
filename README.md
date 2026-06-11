# 🐻 Erklärbär

Jedes Thema, dein Level – von Kind bis Einstein.

PDF hochladen oder Thema eingeben → Erklärungen auf 5 Schwierigkeitsstufen (🧸 Kind, 🎒 Schüler, 🎓 Student, 🔬 Experte, 🧠 Einstein), einzeln oder alle gleichzeitig.

## Struktur

```
erklaerbaer/
├── index.html       ← komplettes Frontend (UI, Slider, PDF-Upload)
├── api/
│   └── explain.js   ← Vercel Serverless Function (versteckt den API-Key)
└── package.json
```

## Deployment (kostenlos, ~10 Minuten)

### 1. API-Key holen
- https://console.anthropic.com → API Keys → Create Key
- Unter Billing ~5€ Guthaben aufladen (reicht für hunderte Erklärungen)

### 2. GitHub Repo erstellen
```bash
cd erklaerbaer
git init
git add .
git commit -m "Erklärbär v1"
gh repo create erklaerbaer --public --push
```
(oder manuell auf github.com ein Repo anlegen und pushen)

### 3. Vercel verbinden
- https://vercel.com → Sign up mit GitHub (kostenlos)
- "Add New Project" → das erklaerbaer-Repo importieren
- **Wichtig:** Unter "Environment Variables" hinzufügen:
  - Name: `ANTHROPIC_API_KEY`
  - Value: dein API-Key aus Schritt 1
- Deploy klicken

### 4. Fertig
Du bekommst eine URL wie `erklaerbaer.vercel.app` – die kannst du an jeden schicken.
Der API-Key liegt sicher auf dem Server und ist im Browser nicht sichtbar.

## Mit Claude Code weiterentwickeln

Im Projektordner einfach:
```bash
claude
```

**Das Backend ist bereits vorbereitet für das Markier-Feature:**
`api/explain.js` enthält schon den Modus `marked` mit 3 Vereinfachungs-Leveln
(`kinderleicht`, `deutlich_einfacher`, `etwas_einfacher`). Das Frontend dafür baust du mit diesem Prompt:

> "Füge ein Feature hinzu: PDFs (PDF.js) und Word-Dateien (mammoth.js) werden im Browser
> angezeigt. Markiert der Nutzer eine Textpassage, erscheint ein 'Erklären'-Button an der
> Markierung. Für markierte Passagen gibt es NUR 3 Vereinfachungs-Level (Kinderleicht /
> Deutlich einfacher / Etwas einfacher) statt der 5 normalen Level. Das Backend ist schon
> fertig: sende an /api/explain ein POST mit { mode: 'marked', markedText: '<markierter Text>',
> levels: ['kinderleicht', 'deutlich_einfacher', 'etwas_einfacher'] } – einzeln oder alle drei."

Weitere Ideen:
- "Füge einen Kopieren-Button zu jeder Erklärung hinzu"
- "Mach eine Share-Funktion mit der man Erklärungen als Bild exportieren kann"
- "Füge ein Quiz-Feature hinzu das nach der Erklärung Fragen stellt"

## Kosten

- Hosting (Vercel): kostenlos
- API: ~0,5-2 Cent pro Erklärung, ~5-10 Cent bei "Alle 5 Level"
- Bei viel Traffic: Rate Limiting einbauen (Claude Code kann das ergänzen)
