import { VertexAI } from '@google-cloud/vertexai';

const PROJECT_ID = process.env.VERTEX_AI_PROJECT || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCATION = process.env.VERTEX_AI_LOCATION || process.env.GCP_LOCATION || 'us-central1';
const API_ENDPOINT = process.env.VERTEX_API_ENDPOINT || `${LOCATION}-aiplatform.googleapis.com`;

// Singleton VertexAI client
let vertex: VertexAI | null = null;

function getVertex(): VertexAI {
  if (!vertex) {
    vertex = new VertexAI({ project: PROJECT_ID || undefined, location: LOCATION, apiEndpoint: API_ENDPOINT } as any);
  }
  return vertex;
}

export async function generateText(options: { model: string; prompt: string }): Promise<string> {
  const { model, prompt } = options;
  const v = getVertex();
  const gen = v.getGenerativeModel({ model });
  const resp = await gen.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  });
  const text = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

export async function generateJson(options: { model: string; prompt: string }): Promise<{ text: string; json?: any }> {
  const text = await generateText(options);
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text };
  }
}
