export interface LLMProviderConfig {
  id: string;
  name: string;
  workerUrl: string;
  badge: string;
  description: string;
  models: string[];
}

export const PROVIDER_OPTIONS: LLMProviderConfig[] = [
  {
    id: "auto",
    name: "Tự động điều phối (Auto Edge Router)",
    workerUrl: "/v1/chat/completions",
    badge: "Multi-Tier Rotation",
    description: "Tự động phân tầng hiệu năng (Tier 1 <15s, Tier 2, Tier 4), probing mẫu đơn, khám phá ε-Greedy, và tự động chuyển đổi khi lỗi.",
    models: ["auto-routing"]
  },
  {
    id: "groq",
    name: "Groq Cloud (Edge Proxy)",
    workerUrl: "https://groq.nclong87.workers.dev/openai/v1",
    badge: "Ultra Fast LPU",
    description: "Cloudflare Worker microservice proxy cho Groq LPU với tốc độ xử lý tức thì.",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-20b"
    ]
  },
  {
    id: "openrouter",
    name: "OpenRouter (Edge Proxy)",
    workerUrl: "https://openrouter.nclong87.workers.dev/api/v1",
    badge: "Multi-Model Hub",
    description: "Cloudflare Worker microservice proxy cho OpenRouter với hơn 100+ mô hình hàng đầu.",
    models: [
      "google/gemini-2.5-flash",
      "google/gemini-2.0-flash",
      "cohere/command-r-plus",
      "meta-llama/llama-3.3-70b-instruct"
    ]
  },
  {
    id: "gemini",
    name: "Google Gemini (Edge Proxy)",
    workerUrl: "https://gemini.nclong87.workers.dev/v1beta",
    badge: "Native v1beta",
    description: "Cloudflare Worker microservice proxy cho Gemini native REST với khả năng hiểu sâu và ngữ cảnh phong phú.",
    models: [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ]
  },
  {
    id: "9flare",
    name: "9Flare (Edge Proxy)",
    workerUrl: "https://9flare.nclong87.workers.dev/api/v1",
    badge: "Premium Pro",
    description: "Cloudflare Worker microservice proxy cho 9Flare Pro models.",
    models: [
      "pro/gpt-5.6-luna",
      "pro/claude-haiku-4-5"
    ]
  },
  {
    id: "ollama",
    name: "Ollama (Edge Proxy)",
    workerUrl: "https://ollama.nclong87.workers.dev/v1",
    badge: "Edge / Local",
    description: "Cloudflare Worker microservice proxy cho Ollama open-weight models.",
    models: [
      "gpt-oss:20b",
      "gemma4:31b",
      "nemotron-3-nano:30b-cloud"
    ]
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    workerUrl: "https://cloudflare.nclong87.workers.dev",
    badge: "Serverless AI",
    description: "Cloudflare Workers AI chạy trực tiếp trên hàng trăm trung tâm dữ liệu toàn cầu.",
    models: [
      "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    ]
  }
];

export const CLOUDFLARE_LLM_PROVIDERS = PROVIDER_OPTIONS;

