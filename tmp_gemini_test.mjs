import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
console.log('apiKey prefix:', apiKey ? apiKey.slice(0, 12) : 'missing');
console.log('model:', model);

const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model,
  contents: [{ role: 'user', parts: [{ text: 'Reply with JSON {"ok":true}' }] }],
  config: { responseMimeType: 'application/json' },
});

console.log('text:', response?.text);
console.log('keys:', Object.keys(response || {}));
console.log('candidateCount:', response?.candidates?.length);
