const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY ?? '';
const API_URL = 'https://api.anthropic.com/v1/messages';

export async function parseSearchQuery(query: string): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Convert this photo search query to 3-6 Russian keywords for full-text search. Return ONLY keywords separated by spaces, no punctuation, no explanation.
Query: "${query}"
Keywords:`,
        },
      ],
    }),
  });
  const data = await response.json();
  const keywords = data.content?.[0]?.text?.trim() ?? query;
  return keywords;
}

export async function describePhoto(base64: string): Promise<{ description: string; tags: string[] }> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            {
              type: 'text',
              text: `Опиши это фото на русском языке. Ответь строго в формате JSON:
{"description":"краткое описание 1-2 предложения","tags":["тег1","тег2","тег3","тег4","тег5"]}
Включи в теги: людей, место, предметы, цвета, время года, настроение. Только JSON, без markdown.`,
            },
          ],
        },
      ],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text?.trim() ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { description: '', tags: [] };
  }
}
