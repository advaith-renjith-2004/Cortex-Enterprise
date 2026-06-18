import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.NVIDIA_BUILD_API_KEY || 'mock-key-for-development';
const baseURL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';

export const isNvidiaMock = apiKey === 'mock-key-for-development';

if (isNvidiaMock) {
  console.warn('[Cortex Config] Warning: NVIDIA_BUILD_API_KEY is not set. NIM clients will run in simulated fallback mode.');
}

// Initialize standard OpenAI compatible client to access NVIDIA NIMs
export const nvidiaClient = new OpenAI({
  apiKey,
  baseURL,
});

export const NVIDIA_CONFIG = {
  llmModel: process.env.NVIDIA_LLM_MODEL || 'meta/llama-3.3-70b-instruct',
  embeddingModel: process.env.NVIDIA_EMBEDDING_MODEL || 'nvidia/embeddings-nv-embed-qa-4',
  embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '1024', 10),
};
