export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    const body = JSON.stringify({ error: 'Method not allowed' });
    return typeof res.json === 'function' ? res.json({ error: 'Method not allowed' }) : res.end(body);
  }

  let payload = req.body;
  if (!payload && typeof req.on === 'function') {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    try {
      payload = JSON.parse(Buffer.concat(buffers).toString());
    } catch {
      payload = null;
    }
  }

  if (!payload || !payload.correctAnswer) {
    res.statusCode = 400;
    const body = JSON.stringify({ error: 'Missing or invalid payload' });
    return typeof res.json === 'function' ? res.json({ error: 'Missing or invalid payload' }) : res.end(body);
  }

  const prompt = `You are a German tutor for an Indian nurse at CEFR A1. You will be given: her answer, the correct answer, their English meanings, and (if relevant) an example sentence.
Rules:
- Use ONLY the German words and English meanings given to you. Never introduce any other German word, translation, or cross-language comparison (no Hindi, no other language) that was not explicitly provided.
- Never make general claims about the world (anatomy, grammar 'always' rules) beyond what's needed to explain this one mistake.
- Write exactly 3 short sentences: (1) name her answer and its meaning, (2) name the correct answer and why it's right here, (3) a clear, easy memory tip using only the words given.
- Simple, friendly English for a beginner. Avoid confusing metaphors or riddles. Keep sentences under 15 words.
If you cannot follow these rules using only the given data, output exactly: FALLBACK

Data:
Exercise Type: ${payload.exerciseType}
Her Answer: ${payload.userAnswer} ${payload.userMeaning ? `(meaning: ${payload.userMeaning})` : ''}
Correct Answer: ${payload.correctAnswer} (meaning: ${payload.correctMeaning})
${payload.example ? `Example Sentence: ${payload.example} (${payload.exampleEn})` : ''}
${payload.tip ? `Tip: ${payload.tip}` : ''}
`;

  const key = process.env.GROQ_API_KEY || process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

  try {
    let explanation = '';

    if (key.startsWith('gsk_')) {
      // Groq
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 120,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.statusCode = response.status;
        return typeof res.json === 'function' ? res.json({ error: errorText }) : res.end(JSON.stringify({ error: errorText }));
      }

      const data = await response.json();
      explanation = data.choices?.[0]?.message?.content?.trim() || '';
    } else if (key.startsWith('sk-ant-')) {
      // Anthropic
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 120,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.statusCode = response.status;
        return typeof res.json === 'function' ? res.json({ error: errorText }) : res.end(JSON.stringify({ error: errorText }));
      }

      const data = await response.json();
      explanation = data.content?.[0]?.text?.trim() || '';
    } else {
      // xAI
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 120,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.statusCode = response.status;
        return typeof res.json === 'function' ? res.json({ error: errorText }) : res.end(JSON.stringify({ error: errorText }));
      }

      const data = await response.json();
      explanation = data.choices?.[0]?.message?.content?.trim() || '';
    }

    res.statusCode = 200;
    if (res.setHeader) res.setHeader('Content-Type', 'application/json');
    if (typeof res.json === 'function') {
      res.json({ explanation });
    } else {
      res.end(JSON.stringify({ explanation }));
    }
  } catch (error) {
    res.statusCode = 500;
    if (typeof res.json === 'function') {
      res.json({ error: error.message });
    } else {
      res.end(JSON.stringify({ error: error.message }));
    }
  }
}
