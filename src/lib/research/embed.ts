import OpenAI from "openai";

const openai = new OpenAI();

// 256 dimensions — small enough to store efficiently, large enough for good recall
export async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
    dimensions: 256,
  });
  return res.data[0].embedding;
}

// Batch multiple texts in a single API call — returns embeddings in same order as input
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts.map(t => t.slice(0, 8000)),
    dimensions: 256,
  });
  return res.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
