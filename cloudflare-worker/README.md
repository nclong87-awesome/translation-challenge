# Cloudflare Worker LLM Proxy & Intelligent Model Rotation Engine

Production-ready serverless edge LLM gateway deployed on Cloudflare Workers. Rotates LLM models, tracks latency/health, enforces dynamic circuit-breaker lockouts, and executes transparent multi-provider failover.

## Quick Start Deployment

```bash
cd cloudflare-worker
npm install

# 1. Create KV Namespace
wrangler kv:namespace create LLM_STATE_KV
wrangler kv:namespace create LLM_STATE_KV --preview

# Update wrangler.toml with the generated IDs

# 2. Configure Secrets
wrangler secret put PROXY_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put GROQ_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put NINEFLARE_API_KEY
wrangler secret put CLOUDFLARE_API_KEY

# 3. Deploy
wrangler deploy
```

## Mandatory Header Directive

**Always pass the access key in the `X-Proxy-Key` header** on all requests to Cloudflare Workers (`*.workers.dev`).
Both client requests to the gateway and gateway dispatch requests to upstream workers unconditionally set this header.

## Verification & Testing

Test via Groq Worker (`groq.nclong87.workers.dev`):
```bash
curl -X POST https://groq.nclong87.workers.dev/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Key: your-access-key" \
  -H "Authorization: Bearer your-access-key" \
  -d '{
    "model": "llama-3.3-70b-versatile",
    "messages": [
      { "role": "system", "content": "You are a concise AI tutor." },
      { "role": "user", "content": "Explain spaced repetition in 1 sentence." }
    ],
    "temperature": 0.7,
    "max_tokens": 100
  }' -i
```

Test via OpenRouter Worker (`openrouter.nclong87.workers.dev`):
```bash
curl -X POST https://openrouter.nclong87.workers.dev/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Key: your-access-key" \
  -H "Authorization: Bearer your-access-key" \
  -H "HTTP-Referer: https://workers.cloudflare.com" \
  -H "X-Title: Cloudflare LLM Edge Proxy" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [
      { "role": "system", "content": "You are a concise AI tutor." },
      { "role": "user", "content": "Explain spaced repetition in 1 sentence." }
    ],
    "temperature": 0.7,
    "max_tokens": 100
  }' -i
```
