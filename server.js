/**
 * Bun HTTP Server for AI Cat Chat
 * Cafe Torcello - AI Cat Chat Experience
 */

import catsJson from './data/cats.json' with { type: 'json' };

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_API_URL = process.env.ZAI_API_URL || 'https://api.z.ai/api/anthropic/v1/messages';
const API_TIMEOUT = 15000; // 15 seconds
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'torcello2024';

// Rate limiting (in-memory for MVP)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 20;

/**
 * Simple rate limiter
 */
function isRateLimited(clientId) {
  const now = Date.now();
  const clientData = requestCounts.get(clientId);

  if (!clientData || now - clientData.resetTime > RATE_LIMIT_WINDOW) {
    requestCounts.set(clientId, { count: 1, resetTime: now });
    return false;
  }

  if (clientData.count >= MAX_REQUESTS_PER_MINUTE) {
    return true;
  }

  clientData.count++;
  return false;
}

/**
 * CORS headers
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Handle OPTIONS
 */
function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * Get all cats (public)
 */
function handleGetAllCats() {
  const publicCats = catsJson.cats.map(({ id, name, emoji, color, greeting }) => ({
    id, name, emoji, color, greeting,
  }));
  return Response.json(publicCats);
}

/**
 * Get single cat (public)
 */
function handleGetSingleCat(pathname) {
  const catId = pathname.slice('/api/cats/'.length);
  const cat = catsJson.cats.find(c => c.id === catId);
  if (!cat) {
    return Response.json({ error: '고양이를 찾을 수 없습니다' }, { status: 404 });
  }
  const { id, name, emoji, color, greeting } = cat;
  return Response.json({ id, name, emoji, color, greeting });
}

/**
 * Handle chat request
 */
async function handleChat(request, catId) {
  if (!ZAI_API_KEY) {
    return Response.json(
      { error: '서버 설정 오류: API 키가 없습니다' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '잘못된 요청 형식입니다' }, { status: 400 });
  }

  const { message, history } = body;
  if (!message || typeof message !== 'string') {
    return Response.json({ error: '메시지가 필요합니다' }, { status: 400 });
  }

  // Find cat
  const cat = catId
    ? catsJson.cats.find(c => c.id === catId)
    : catsJson.cats[0];
  if (!cat) {
    return Response.json({ error: '고양이를 찾을 수 없습니다' }, { status: 404 });
  }

  // Rate limiting
  const clientId = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(clientId)) {
    return Response.json(
      { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    );
  }

  // Build messages with history
  const messagesWithContext = (history || []).map(h => ({
    role: h.role,
    content: h.content,
  }));
  messagesWithContext.push({ role: 'user', content: message });

  // Call API with timeout
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
        model: 'claude-haiku-4-20250514',
        max_tokens: 1024,
        system: cat.systemPrompt,
        messages: messagesWithContext,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    return Response.json({ reply });

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      return Response.json(
        { error: '고양이가 잠시 멈췄어요. 다시 시도해주세요!' },
        { status: 504 }
      );
    }

    console.error('Chat error:', error);
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
  let filePath = pathname === '/' ? './public/index.html' : `./public${pathname}`;

  if (filePath.endsWith('/')) {
    filePath += 'index.html';
  }

  try {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response('Not found', { status: 404 });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/**
 * Write cats data to disk
 */
async function saveCatsData() {
  await Bun.write('./data/cats.json', JSON.stringify(catsJson, null, 2));
}

/**
 * Check admin auth
 */
function checkAdmin(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 });
  }
  return null;
}

/**
 * Admin: update cat
 */
async function handleAdminUpdate(request, pathname) {
  const authError = checkAdmin(request);
  if (authError) return authError;

  const catId = pathname.slice('/api/admin/cats/'.length);
  const catIndex = catsJson.cats.findIndex(c => c.id === catId);
  if (catIndex === -1) {
    return Response.json({ error: '고양이를 찾을 수 없습니다' }, { status: 404 });
  }

  try {
    const body = await request.json();
    if (body.name) catsJson.cats[catIndex].name = body.name;
    if (body.emoji) catsJson.cats[catIndex].emoji = body.emoji;
    if (body.color) catsJson.cats[catIndex].color = body.color;
    if (body.greeting) catsJson.cats[catIndex].greeting = body.greeting;
    if (body.systemPrompt) catsJson.cats[catIndex].systemPrompt = body.systemPrompt;

    await saveCatsData();
    console.log(`Updated cat: ${catId}`);
    return Response.json({ success: true, cat: catsJson.cats[catIndex] });
  } catch (e) {
    console.error('Admin update error:', e);
    return Response.json({ error: '업데이트 실패' }, { status: 500 });
  }
}

/**
 * Admin: add new cat
 */
async function handleAdminAdd(request) {
  const authError = checkAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, emoji, color, systemPrompt, greeting } = body;

    if (!name || !systemPrompt) {
      return Response.json({ error: '이름과 프롬프트는 필수입니다' }, { status: 400 });
    }

    const newCat = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${String(catsJson.cats.length + 1).padStart(2, '0')}`,
      name,
      emoji: emoji || '🐱',
      color: color || '#FFB6C1',
      systemPrompt,
      greeting: greeting || `안냥! 나는 ${name}이당! 😺`,
    };

    catsJson.cats.push(newCat);
    await saveCatsData();
    console.log(`Added cat: ${newCat.id}`);
    return Response.json({ success: true, cat: newCat });
  } catch (e) {
    console.error('Admin add error:', e);
    return Response.json({ error: '추가 실패' }, { status: 500 });
  }
}

/**
 * Admin: delete cat
 */
async function handleAdminDelete(pathname) {
  const catId = pathname.slice('/api/admin/cats/'.length);
  const catIndex = catsJson.cats.findIndex(c => c.id === catId);
  if (catIndex === -1) {
    return Response.json({ error: '고양이를 찾을 수 없습니다' }, { status: 404 });
  }
  if (catsJson.cats.length <= 1) {
    return Response.json({ error: '최소 1마리의 고양이가 필요합니다' }, { status: 400 });
  }

  catsJson.cats.splice(catIndex, 1);
  await saveCatsData();
  console.log(`Deleted cat: ${catId}`);
  return Response.json({ success: true });
}

/**
 * Bun server
 */
Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    // Health check
    if (pathname === '/api/health') {
      return Response.json({ status: 'ok' });
    }

    // Public: all cats
    if (pathname === '/api/cats') {
      const r = handleGetAllCats();
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Public: single cat
    if (pathname.startsWith('/api/cats/') && pathname.length > '/api/cats/'.length) {
      const r = handleGetSingleCat(pathname);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Public: chat (default cat)
    if (pathname === '/api/chat' && request.method === 'POST') {
      const r = await handleChat(request, null);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Public: chat (specific cat)
    if (pathname.match(/^\/api\/chat\/[\w-]+$/) && request.method === 'POST') {
      const catId = pathname.slice('/api/chat/'.length);
      const r = await handleChat(request, catId);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Admin: update cat
    if (pathname.match(/^\/api\/admin\/cats\/[\w-]+$/) && request.method === 'PUT') {
      const r = await handleAdminUpdate(request, pathname);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Admin: add cat
    if (pathname === '/api/admin/cats' && request.method === 'POST') {
      const r = await handleAdminAdd(request);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Admin: delete cat
    if (pathname.match(/^\/api\/admin\/cats\/[\w-]+$/) && request.method === 'DELETE') {
      const r = await handleAdminDelete(pathname);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    // Static files
    return serveStatic(pathname);
  },
});

console.log(`🐱 Cat Chat server running on http://localhost:${PORT}`);
console.log(`   Cats: ${catsJson.cats.map(c => `${c.emoji} ${c.name}`).join(', ')}`);
