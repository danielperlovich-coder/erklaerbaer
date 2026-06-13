// Vercel Serverless Function – hält den API-Key sicher auf dem Server.
// Der Key kommt aus der Umgebungsvariable ANTHROPIC_API_KEY (in Vercel hinterlegt).
//
// Phase 1+2 eingebaut:
// - Beispiele in allen Level-Prompts
// - Doppelter kinderleicht-Key behoben (marked_* umbenannt)
// - Promise.allSettled statt Promise.all (ein Fehler killt nicht alle)
// - Retry mit Backoff bei 429/529 (Rate Limit / Überlastung)
// - Sprachauswahl (language-Parameter)
// - max_tokens 1000

const LEVEL_PROMPTS = {
  gleiche_ebene: `Schritt 1 – Niveau des Textes einschätzen:
Bevor du erklärst, analysiere kurz das Niveau des Ausgangsmaterials (z.B. wissenschaftlich, technisch-fachlich, populärwissenschaftlich, schulisch). Passe deine Erklärung GENAU auf dieses Niveau an.

Schritt 2 – Erklärung auf gleichem Niveau, aber zugänglicherer Sprache:
- Behalte denselben Abstraktionsgrad und dieselben Fachbegriffe wie das Original
- Ersetze nur unnötig komplizierte Satzkonstruktionen durch klarere
- Erkläre Fachbegriffe die im Original nicht erklärt werden in einem Nebensatz
- Kein Detail weglassen – das Niveau-Äquivalent muss inhaltlich vollständig sein
- Wie ein erfahrener Autor der einen Fachtext redigiert: präzise, aber lesbar
- Schließe IMMER ein konkretes Beispiel auf genau diesem Fachniveau ein, eingeleitet mit "Beispiel:". Das Beispiel soll fachadäquat sein und das Konzept illustrieren.`,

  fachlich: `Erkläre auf fachlich anspruchsvollem Niveau für jemanden mit Vorbildung:
- Nutze die korrekte Fachterminologie, ohne sie zu verwässern
- Geh in die Tiefe: Mechanismen, Zusammenhänge, das "Warum" dahinter
- Benenne relevante Nuancen, Grenzfälle oder offene Fragen im Feld
- Ordne das Konzept in den größeren fachlichen Kontext ein
- Präzise und dicht, wie ein Fachvortrag für Kolleg:innen
- Schließe IMMER ein fachadäquates Beispiel ein, eingeleitet mit "Beispiel:".`,

  alltagstauglich: `Erkläre so, dass jeder Erwachsene es ohne Fachkenntnisse versteht:
- Ersetze alle Fachbegriffe durch Alltagssprache oder erkläre sie sofort mit einem konkreten Beispiel
- Nutze Vergleiche aus dem Alltag (Haushalt, Arbeit, Einkaufen, Familie)
- 3-5 kurze Absätze oder 6-8 Sätze
- Das "Was bedeutet das für mich?"-Gefühl soll entstehen
- Kein Vorwissen voraussetzen, aber auch nicht herablassend – wie ein kluger Freund der das Thema kennt
- Schließe IMMER ein konkretes, alltagsnahes Beispiel ein, eingeleitet mit "Beispiel:". Es muss sofort nachvollziehbar sein (Einkaufen, Arbeit, Familie, Haushalt).`,

  kinderleicht: `Erkläre so einfach wie möglich – für jemanden der absolut kein Vorwissen hat:
- Nutze Bilder, Vergleiche und Geschichten aus der Kinderwelt (Spielzeug, Tiere, Familie, Schule)
- KEINE Fachbegriffe – wenn ein Begriff unvermeidbar ist, sofort mit einem Bild erklären
- Maximal 4-5 kurze Sätze
- Das Wesentliche muss ankommen, Details dürfen wegfallen
- Warm und einfach, wie eine Erklärung von einem netten älteren Geschwisterkind
- Schließe IMMER ein einfaches Beispiel aus der Kinderwelt ein, eingeleitet mit "Beispiel:".`,

  // --- Vereinfachungs-Level für markierte Textpassagen (Reader-Modus, Phase 4) ---
  // WICHTIG: marked_ Präfix, damit kein doppelter Key mit dem Haupt-Level "kinderleicht" entsteht.
  marked_kinderleicht: `Vereinfache den folgenden markierten Text so, dass ihn ein Kind versteht:
- Nutze Alltagsvergleiche und einfache Bilder
- KEINE Fachbegriffe
- Kurze Sätze, maximal 5
- Der Kerngedanke muss erhalten bleiben, Details dürfen wegfallen`,

  marked_deutlich_einfacher: `Schreibe den folgenden markierten Text deutlich einfacher um:
- Kurze, klare Sätze
- Fachbegriffe ersetzen oder sofort in Klammern erklären
- Alltagsbeispiele ergänzen wo es hilft
- Alle wichtigen Aussagen müssen erhalten bleiben`,

  marked_etwas_einfacher: `Mache den folgenden markierten Text zugänglicher, behalte aber das Niveau grob bei:
- Verschachtelte Sätze auflösen
- Nur die schwierigsten Begriffe kurz erklären
- Struktur und Präzision des Originals beibehalten
- Wie ein guter Lektor der den Text lesbarer macht ohne ihn zu verwässern`
};

// Ruft die Anthropic-API auf, mit automatischem Retry bei Rate Limit (429)
// oder Überlastung (529). Wartet 1s, 2s, 3s zwischen den Versuchen.
async function callAnthropic(body, apiKey, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      // Bei Rate Limit / Überlastung: warten und erneut versuchen
      if (resp.status === 429 || resp.status === 529) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        lastErr = new Error('API überlastet (Rate Limit)');
        continue;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API-Fehler ${resp.status}`);
      }

      return resp;
    } catch (e) {
      lastErr = e;
      // Netzwerkfehler: kurz warten und nochmal
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr || new Error('API nicht erreichbar');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server nicht konfiguriert (API-Key fehlt)' });
  }

  const { levels, mode, topic, passage, pdf, markedText, detectedNiveau } = req.body || {};
  const language = req.body.language || 'Deutsch';

  // --- Eingaben prüfen ---
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

  // --- Basis-Anweisung je nach Modus ---
  let baseInstruction;
  if (mode === 'topic') {
    baseInstruction = `Thema: "${topic}"`;
  } else if (mode === 'marked') {
    baseInstruction = `Niveau des Originaldokuments: ${detectedNiveau || 'unbekannt'}.
Markierter Originaltext:\n"""\n${markedText}\n"""`;
  } else {
    baseInstruction = passage
      ? `Erkläre aus der beigefügten PDF speziell: "${passage}"`
      : `Erkläre das zentrale Thema / die Kernkonzepte der beigefügten PDF`;
  }

  // --- Alle gewünschten Level parallel anfragen ---
  const requests = levels.map(async (lvl) => {
    const levelPrompt = LEVEL_PROMPTS[lvl];
    if (!levelPrompt) {
      throw new Error(`Unbekanntes Level: ${lvl}`);
    }

    const content = [];
    if (mode === 'pdf' && pdf) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf }
      });
    }
    content.push({
      type: 'text',
      text: `${baseInstruction}\n\n${levelPrompt}\n\nAntworte auf ${language}. Auch das Beispiel muss im Sprach- und Kulturraum von ${language} verständlich sein – nicht aus dem Deutschen übersetzt, sondern für diese Sprache neu gedacht. Gib NUR die Erklärung aus, ohne Einleitung wie "Gerne erkläre ich..." und ohne Meta-Kommentare.`
    });

    const resp = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content }]
    }, apiKey);

    const data = await resp.json();
    const text = data.content.map(b => b.text || '').join('');
    return [lvl, text.trim()];
  });

  // allSettled: ein fehlgeschlagenes Level reißt die anderen NICHT mit runter
  const settled = await Promise.allSettled(requests);
  const explanations = {};
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const [lvl, text] = r.value;
      explanations[lvl] = text;
    }
  }

  // Nur wenn ALLE Level fehlgeschlagen sind: sauberer Fehler
  if (Object.keys(explanations).length === 0) {
    return res.status(502).json({
      error: 'Erklärung konnte nicht erzeugt werden. Bitte erneut versuchen.'
    });
  }

  return res.status(200).json({ explanations });
}
