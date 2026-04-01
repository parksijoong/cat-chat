/**
 * Bun HTTP Server for AI Cat Chat
 * Cafe Torcello - AI Cat Chat Experience
 */

import catsJson from './data/cats.json' with { type: 'json' };
const cats = catsJson;

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_API_URL = process.env.ZAI_API_URL || 'https://api.z.ai/api/anthropic/v1/messages';
const API_TIMEOUT = 10000; // 10 seconds

// Rate limiting (in-memory for MVP)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 20;

/**
 * Simple rate limiter - returns true if rate limit exceeded
 */
function isRateLimited(clientId) {
  const now = Date.now();
  const clientData = requestCounts.get(clientId);

  if (!clientData || now - clientData.resetTime > RATE_LIMIT_WINDOW) {
    requestCounts.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (clientData.count >= MAX_REQUESTS_PER_MINUTE) {
    return true;
  }

  clientData.count++;
  return false;
}

/**
 * Send CORS headers
 */
function setCorsHeaders(response) {
  response.headers.set('Access-Control-Allow-Origin', 'http://localhost:3000');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Handle OPTIONS request for CORS preflight
 */
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Fetch cat data
 */
function getCatData() {
  return Response.json(cats.cat);
}

/**
 * Handle chat request - proxy to z.ai API
 */
async function handleChat(request) {
  // Check API key
  if (!ZAI_API_KEY) {
    return Response.json(
      { error: '서버 설정 오류: API 키가 없습니다' },
      { status: 500 }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json(
      { error: '잘못된 요청 형식입니다' },
      { status: 400 }
    );
  }

  const { message } = body;

  if (!message || typeof message !== 'string') {
    return Response.json(
      { error: '메시지가 필요합니다' },
      { status: 400 }
    );
  }

  // Rate limiting
  const clientId = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(clientId)) {
    return Response.json(
      { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    );
  }

  // Call z.ai API with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(ZAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ZAI_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: cats.cat.systemPrompt,
        messages: [
          { role: 'user', content: message },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract response text from Anthropic format
    const reply = data.content?.[0]?.text || '';

    return Response.json({ reply });

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      return Response.json(
        { error: '몽글이가 잠시 멈췄어요. 다시 시도해주세요!' },
        { status: 504 }
      );
    }

    console.error('Chat API error:', error);
    return Response.json(
      { error: '죄송해요. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}

/**
 * Serve static files
 */
async function serveStatic(pathname) {
  let filePath = pathname === '/' ? '/public/index.html' : `/public${pathname}`;

  // Default to index.html for directory requests
  if (filePath.endsWith('/')) {
    filePath += 'index.html';
  }

  try {
    const file = Bun.file(filePath.replace(/^\/public/, './public'));
    return new Response(file);
  } catch (e) {
    return new Response('Not found', { status: 404 });
  }
}

/**
 * Main Bun server
 */
Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    // API routes
    if (pathname === '/api/cat') {
      const response = getCatData();
      setCorsHeaders(response);
      return response;
    }

    if (pathname === '/api/chat' && request.method === 'POST') {
      const response = await handleChat(request);
      setCorsHeaders(response);
      return response;
    }

    // Static files
    return serveStatic(pathname);
  },
});

console.log(`🐱 Cat Chat server running on http://localhost:${PORT}`);
console.log(`   Cat: ${cats.cat.name} (${cats.cat.emoji})`);
