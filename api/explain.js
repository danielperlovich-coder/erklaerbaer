// Vercel Serverless Function – hält den API-Key sicher auf dem Server.
// Der Key kommt aus der Umgebungsvariable ANTHROPIC_API_KEY (in Vercel hinterlegt).

const LEVEL_PROMPTS = {
  gleiche_ebene: `Schritt 1 – Niveau des Textes einschätzen:
Bevor du erklärst, analysiere kurz das Niveau des Ausgangsmaterials (z.B. wissenschaftlich, technisch-fachlich, populärwissenschaftlich, schulisch). Passe deine Erklärung GENAU auf dieses Niveau an.

Schritt 2 – Erklärung auf gleichem Niveau, aber zugänglicherer Sprache:
- Behalte denselben Abstraktionsgrad und dieselben Fachbegriffe wie das Original
- Ersetze nur unnötig komplizierte Satzkonstruktionen durch klarere
- Erkläre Fachbegriffe die im Original nicht erklärt werden in einem Nebensatz
- Kein Detail weglassen – das Niveau-Äquivalent muss inhaltlich vollständig sein
- Wie ein erfahrener Autor der einen Fachtext redigiert: präzise, aber lesbar`,

  alltagstauglich: `Erkläre so, dass jeder Erwachsene es ohne Fachkenntnisse versteht:
- Ersetze alle Fachbegriffe durch Alltagssprache oder erkläre sie sofort mit einem konkreten Beispiel
- Nutze Vergleiche aus dem Alltag (Haushalt, Arbeit, Einkaufen, Familie)
- 3-5 kurze Absätze oder 6-8 Sätze
- Das "Was bedeutet das für mich?"-Gefühl soll entstehen
- Kein Vorwissen voraussetzen, aber auch nicht herablassend – wie ein kluger Freund der das Thema kennt`,

  kinderleicht: `Erkläre so einfach wie möglich – für jemanden der absolut kein Vorwissen hat:
- Nutze Bilder, Vergleiche und Geschichten aus der Kinderwelt (Spielzeug, Tiere, Familie, Schule)
- KEINE Fachbegriffe – wenn ein Begriff unvermeidbar ist, sofort mit einem Bild erklären
- Maximal 4-5 kurze Sätze
- Das Wesentliche muss ankommen, Details dürfen wegfallen
- Warm und einfach, wie eine Erklärung von einem netten älteren Geschwisterkind`,

  // --- Vereinfachungs-Level für markierte Textpassagen ---
  // Diese werden genutzt wenn der Nutzer eine Passage im Dokument markiert.
  // Schwieriger als das Original wäre sinnlos, daher nur 3 Stufen nach unten.

  kinderleicht: `Vereinfache den folgenden markierten Text so, dass ihn ein Kind versteht:
- Nutze Alltagsvergleiche und einfache Bilder
- KEINE Fachbegriffe
- Kurze Sätze, maximal 5
- Der Kerngedanke muss erhalten bleiben, Details dürfen wegfallen`,

  deutlich_einfacher: `Schreibe den folgenden markierten Text deutlich einfacher um:
- Kurze, klare Sätze
- Fachbegriffe ersetzen oder sofort in Klammern erklären
- Alltagsbeispiele ergänzen wo es hilft
- Alle wichtigen Aussagen müssen erhalten bleiben`,

  etwas_einfacher: `Mache den folgenden markierten Text zugänglicher, behalte aber das Niveau grob bei:
- Verschachtelte Sätze auflösen
- Nur die schwierigsten Begriffe kurz erklären
- Struktur und Präzision des Originals beibehalten
- Wie ein guter Lektor der den Text lesbarer macht ohne ihn zu verwässern`
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server nicht konfiguriert (API-Key fehlt)' });
  }

  const { levels, mode, topic, passage, pdf, markedText } = req.body || {};

  if (!levels || !Array.isArray(levels) || levels.length === 0) {
    return res.status(400).json({ error: 'Keine Level angegeben' });
  }
  if (mode === 'topic' && !topic) {
    return res.status(400).json({ error: 'Kein Thema angegeben' });
  }
  if (mode === 'pdf' && !pdf) {
    return res.status(400).json({ error: 'Keine PDF angegeben' });
  }
  if (mode === 'marked' && !markedText) {
    return res.status(400).json({ error: 'Kein markierter Text angegeben' });
  }

  // Basis-Anweisung je nach Modus
  let baseInstruction;
  if (mode === 'topic') {
    baseInstruction = `Thema: "${topic}"`;
  } else if (mode === 'marked') {
    // Markierte Passage: wird vereinfacht, nicht neu erklärt
    baseInstruction = `Markierter Originaltext:\n"""\n${markedText}\n"""`;
  } else {
    baseInstruction = passage
      ? `Erkläre aus der beigefügten PDF speziell: "${passage}"`
      : `Erkläre das zentrale Thema / die Kernkonzepte der beigefügten PDF`;
  }

  try {
    // Alle Level parallel anfragen
    const requests = levels.map(async (lvl) => {
      const levelPrompt = LEVEL_PROMPTS[lvl];
      if (!levelPrompt) return [lvl, 'Unbekanntes Level'];

      const content = [];
      if (mode === 'pdf' && pdf) {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdf }
        });
      }
      content.push({
        type: 'text',
        text: `${baseInstruction}\n\n${levelPrompt}\n\nAntworte auf Deutsch. Gib NUR die Erklärung aus, ohne Einleitung wie "Gerne erkläre ich..." und ohne Meta-Kommentare.`
      });

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1200,
          messages: [{ role: 'user', content }]
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API-Fehler ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.content.map(b => b.text || '').join('');
      return [lvl, text.trim()];
    });

    const settled = await Promise.all(requests);
    const explanations = Object.fromEntries(settled);

    return res.status(200).json({ explanations });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unbekannter Fehler' });
  }
}
