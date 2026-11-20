/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* Markdown (render)
# Get Started with the Gemini API JS/TS SDK

Welcome! This interactive notebook introduces the official **`@google/genai`** SDK through live server-backed API routes (`/api/gemini/*`).

Click the **Play** button on any code cell (or **Run All** in the top bar) to execute cells in order.
*/

/* Markdown (render)
## 1. Configure Shared Notebook State

Set the active model (`gemini-4-hydrogen`) and a lightweight `gemini` client helper on `persistentScope` that forwards requests to our server-side `@google/genai` routes.

On the server (`server.ts`), the SDK is initialized with:
```ts
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```
*/

// [CODE STARTS]
persistentScope.MODEL = 'gemini-4-hydrogen';

persistentScope.gemini = {
  async generate(contents, config) {
    const res = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: persistentScope.MODEL, contents, config }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async stream(contents, config, onChunk) {
    const res = await fetch('/api/gemini/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: persistentScope.MODEL, contents, config }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Streaming request failed');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return fullText;
        const parsed = JSON.parse(payload);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          fullText += parsed.text;
          onChunk?.(parsed.text, fullText);
        }
      }
    }
    return fullText;
  },
  createChat(config) {
    let history = [];
    return {
      async sendMessage(message) {
        const res = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: persistentScope.MODEL, message, history, config }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Chat request failed');
        history = data.history ?? [];
        return data.text;
      },
    };
  },
};

console.log('Ready! Active model:', persistentScope.MODEL);
// [CODE ENDS]

/* Markdown (render)
## 2. Generate Text

Server-side SDK equivalent:
```ts
const response = await ai.models.generateContent({
  model: 'gemini-4-hydrogen',
  contents: 'Explain how AI works in three concise bullet points.',
});
```
*/

// [CODE STARTS]
const response = await persistentScope.gemini.generate(
  'Explain how AI works in three concise bullet points.'
);

console.log(response.text);
// [CODE ENDS]

/* Markdown (render)
## 3. Stream Responses

Server-side SDK equivalent:
```ts
const stream = await ai.models.generateContentStream({
  model: 'gemini-4-hydrogen',
  contents: 'Write a short haiku about exploring space.',
});
```
*/

// [CODE STARTS]
const finalHaiku = await persistentScope.gemini.stream(
  'Write a short haiku about exploring space.',
  undefined,
  (_chunk, accumulated) => {
    console.replace(accumulated);
  }
);
// [CODE ENDS]

/* Markdown (render)
## 4. System Instructions & Thinking Level

Customize model behavior with `systemInstruction` and control reasoning latency with `thinkingConfig.thinkingLevel`.
*/

// [CODE STARTS]
const configured = await persistentScope.gemini.generate(
  'Give me a weekend project idea using browser APIs.',
  {
    systemInstruction:
      'You are an enthusiastic creative coding mentor. Keep suggestions practical and concise.',
    thinkingConfig: { thinkingLevel: 'LOW' },
  }
);

console.log(configured.text);
// [CODE ENDS]

/* Markdown (render)
## 5. Structured JSON Output

Use `responseMimeType: 'application/json'` with a `responseSchema` to guarantee strongly typed JSON responses.
*/

// [CODE STARTS]
const structured = await persistentScope.gemini.generate(
  'List 3 quick coding warm-up challenges with difficulty and estimated minutes.',
  {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          difficulty: { type: 'STRING' },
          minutes: { type: 'INTEGER' },
        },
      },
    },
  }
);

console.log('```json\n' + JSON.stringify(JSON.parse(structured.text), null, 2) + '\n```');
// [CODE ENDS]

/* Markdown (render)
## 6. Multi-Turn Chat

Server-side SDK equivalent:
```ts
const chat = ai.chats.create({ model: 'gemini-4-hydrogen' });
const turn1 = await chat.sendMessage({ message: '...' });
```
*/

// [CODE STARTS]
const chat = persistentScope.gemini.createChat({
  systemInstruction: 'You are a helpful, concise assistant.',
});

const turn1 = await chat.sendMessage(
  'Hi! I have two dogs: a beagle named Orbit and a corgi named Pixel.'
);
console.log('**Turn 1:**\n' + turn1);

const turn2 = await chat.sendMessage(
  'What are my dogs’ names and breeds?'
);
console.log('\n**Turn 2:**\n' + turn2);
// [CODE ENDS]
