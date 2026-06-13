// Vercel Serverless Function – erkennt das Niveau eines PDF-Textes in einem Wort.
// Wird vom Reader-Modus beim Upload aufgerufen, um die Erklärungen passend
// einzuordnen. Hält den API-Key serverseitig (ANTHROPIC_API_KEY).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server nicht konfiguriert (API-Key fehlt)' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'Kein Text zum Einschätzen' });
  }

  // Nur den Anfang senden – reicht zur Niveau-Einschätzung und spart Tokens/Zeit.
  const sample = text.slice(0, 6000);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16,
        messages: [{
          role: 'user',
          content: `Stufe das Niveau des folgenden Textes in GENAU EINEM Wort ein. Erlaubte Antworten: wissenschaftlich, fachlich, populärwissenschaftlich, schulisch. Antworte NUR mit dem einen Wort, ohne Satzzeichen.\n\nText:\n"""\n${sample}\n"""`
        }]
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API-Fehler ${resp.status}` });
    }

    const data = await resp.json();
    let niveau = data.content.map(b => b.text || '').join('').trim().toLowerCase();
    // Auf ein sauberes Wort reduzieren
    niveau = niveau.replace(/[^a-zäöüß]/gi, '');

    const erlaubt = ['wissenschaftlich', 'fachlich', 'populärwissenschaftlich', 'schulisch'];
    if (!erlaubt.includes(niveau)) niveau = '';

    return res.status(200).json({ niveau });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unbekannter Fehler' });
  }
}
