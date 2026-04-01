/**
 * Bun HTTP Server for AI Cat Chat
 * Cafe Torcello - AI Cat Chat Experience
 */

import catsJson from './data/cats.json' with { type: 'json' };
import quizzesJson from './data/quizzes.json' with { type: 'json' };

// Load coupons
let coupons = [];
try {
  coupons = await Bun.file('./data/coupons.json').json();
} catch { coupons = []; }

// Config
const PORT = parseInt(process.env.PORT || '3000', 10);
const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_API_URL = process.env.ZAI_API_URL || 'https://api.z.ai/api/anthropic/v1/messages';
const API_TIMEOUT = 15000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'torcello2024';

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_MINUTE = 20;

function isRateLimited(clientId) {
  const now = Date.now();
  const clientData = requestCounts.get(clientId);
  if (!clientData || now - clientData.resetTime > RATE_LIMIT_WINDOW) {
    requestCounts.set(clientId, { count: 1, resetTime: now });
    return false;
  }
  if (clientData.count >= MAX_REQUESTS_PER_MINUTE) return true;
  clientData.count++;
  return false;
}

// Helpers
function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

function checkAdmin(request) {
  if (request.headers.get('authorization') !== `Bearer ${ADMIN_PASSWORD}`) {
    return jsonResponse({ error: '인증이 필요합니다' }, 401);
  }
  return null;
}

function generateCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `TC-${seg()}-${seg()}`;
}

async function saveQuizzes() {
  await Bun.write('./data/quizzes.json', JSON.stringify(quizzesJson, null, 2));
}

async function saveCoupons() {
  await Bun.write('./data/coupons.json', JSON.stringify(coupons, null, 2));
}

async function saveCatsData() {
  await Bun.write('./data/cats.json', JSON.stringify(catsJson, null, 2));
}

// --- PUBLIC APIs ---

function handleGetAllCats() {
  return catsJson.cats.map(({ id, name, emoji, color, greeting }) => ({ id, name, emoji, color, greeting }));
}

function handleGetSingleCat(catId) {
  const cat = catsJson.cats.find(c => c.id === catId);
  if (!cat) return null;
  const { id, name, emoji, color, greeting, quizzes } = cat;
  return { id, name, emoji, color, greeting, quizzes };
}

function handleGetQuiz() {
  const active = quizzesJson.filter(q => q.active);
  if (active.length === 0) return null;
  const quiz = active[Math.floor(Math.random() * active.length)];
  return { id: quiz.id, question: quiz.question, hint: quiz.hint };
}

function handleQuizAnswer(body) {
  const { quizId, answer } = body;
  const quiz = quizzesJson.find(q => q.id === quizId);
  if (!quiz) return { error: '퀴즈를 찾을 수 없습니다' };

  // Normalize: lowercase, trim, remove spaces
  const normalize = s => String(s).toLowerCase().trim().replace(/\s+/g, '');
  const correct = normalize(answer).includes(normalize(quiz.answer)) ||
                  normalize(quiz.answer).includes(normalize(answer));

  if (correct) {
    const code = generateCouponCode();
    coupons.push({
      code,
      quizId: quiz.id,
      question: quiz.question,
      used: false,
      createdAt: new Date().toISOString(),
    });
    saveCoupons();
    console.log(`Coupon issued: ${code} for quiz ${quiz.id}`);
    return { correct: true, code, answer: quiz.answer };
  }

  return { correct: false, answer: quiz.answer };
}

// --- CHAT ---

async function handleChat(request, catId) {
  if (!ZAI_API_KEY) return jsonResponse({ error: '서버 설정 오류' }, 500);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: '잘못된 요청' }, 400); }

  const { message, history } = body;
  if (!message || typeof message !== 'string') return jsonResponse({ error: '메시지가 필요합니다' }, 400);

  const cat = catId ? catsJson.cats.find(c => c.id === catId) : catsJson.cats[0];
  if (!cat) return jsonResponse({ error: '고양이를 찾을 수 없습니다' }, 404);

  const clientId = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(clientId)) return jsonResponse({ error: '너무 많은 요청입니다' }, 429);

  // Build messages
  const messages = (history || []).map(h => ({ role: h.role, content: h.content }));
  messages.push({ role: 'user', content: message });

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
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error('API error:', await response.text());
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';
    return jsonResponse({ reply });

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') return jsonResponse({ error: '고양이가 잠시 멈췄어요!' }, 504);
    console.error('Chat error:', error);
    return jsonResponse({ error: '다시 시도해주세요.' }, 500);
  }
}

// --- ADMIN APIs ---

async function handleAdminUpdateCat(request, catId) {
  const body = await request.json();
  const catIndex = catsJson.cats.findIndex(c => c.id === catId);
  if (catIndex === -1) return jsonResponse({ error: '고양이를 찾을 수 없습니다' }, 404);

  ['name', 'emoji', 'color', 'systemPrompt', 'greeting'].forEach(k => {
    if (body[k]) catsJson.cats[catIndex][k] = body[k];
  });
  await saveCatsData();
  return { success: true, cat: catsJson.cats[catIndex] };
}

async function handleAdminAddCat(request) {
  const body = await request.json();
  if (!body.name || !body.systemPrompt) return jsonResponse({ error: '이름과 프롬프트 필수' }, 400);

  const newCat = {
    id: `${body.name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${String(catsJson.cats.length + 1).padStart(2, '0')}`,
    name: body.name,
    emoji: body.emoji || '🐱',
    color: body.color || '#FFB6C1',
    systemPrompt: body.systemPrompt,
    greeting: body.greeting || `안냥! 나는 ${body.name}이당! 😺`,
  };
  catsJson.cats.push(newCat);
  await saveCatsData();
  return { success: true, cat: newCat };
}

async function handleAdminDeleteCat(catId) {
  const i = catsJson.cats.findIndex(c => c.id === catId);
  if (i === -1) return jsonResponse({ error: '고양이를 찾을 수 없습니다' }, 404);
  if (catsJson.cats.length <= 1) return jsonResponse({ error: '최소 1마리 필요' }, 400);
  catsJson.cats.splice(i, 1);
  await saveCatsData();
  return { success: true };
}

async function handleAdminAddQuiz(request) {
  const body = await request.json();
  if (!body.question || !body.answer) return jsonResponse({ error: '질문과 정답 필수' }, 400);

  const quiz = {
    id: `q${Date.now()}`,
    question: body.question,
    answer: body.answer,
    hint: body.hint || '',
    active: true,
  };
  quizzesJson.push(quiz);
  await saveQuizzes();
  return { success: true, quiz };
}

async function handleAdminUpdateQuiz(request, quizId) {
  const body = await request.json();
  const i = quizzesJson.findIndex(q => q.id === quizId);
  if (i === -1) return jsonResponse({ error: '퀴즈를 찾을 수 없습니다' }, 404);

  ['question', 'answer', 'hint'].forEach(k => {
    if (body[k] !== undefined) quizzesJson[i][k] = body[k];
  });
  if (body.active !== undefined) quizzesJson[i].active = body.active;
  await saveQuizzes();
  return { success: true, quiz: quizzesJson[i] };
}

async function handleAdminDeleteQuiz(quizId) {
  const i = quizzesJson.findIndex(q => q.id === quizId);
  if (i === -1) return jsonResponse({ error: '퀴즈를 찾을 수 없습니다' }, 404);
  quizzesJson.splice(i, 1);
  await saveQuizzes();
  return { success: true };
}

// --- STATIC FILES ---

async function serveStatic(pathname) {
  let filePath = pathname === '/' ? './public/index.html' : `./public${pathname}`;
  if (filePath.endsWith('/')) filePath += 'index.html';
  try {
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);
  } catch {}
  return new Response('Not found', { status: 404 });
}

// --- SERVER ---

Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health
    if (pathname === '/api/health') return jsonResponse({ status: 'ok' });

    // --- PUBLIC ---
    if (pathname === '/api/cats' && request.method === 'GET') return jsonResponse(handleGetAllCats());
    if (pathname.match(/^\/api\/cats\/[\w-]+$/) && request.method === 'GET') {
      const cat = handleGetSingleCat(pathname.slice('/api/cats/'.length));
      return cat ? jsonResponse(cat) : jsonResponse({ error: 'not found' }, 404);
    }
    if (pathname === '/api/chat' && request.method === 'POST') return await handleChat(request, null);
    if (pathname.match(/^\/api\/chat\/[\w-]+$/) && request.method === 'POST') {
      return await handleChat(request, pathname.slice('/api/chat/'.length));
    }

    // Quiz public
    if (pathname === '/api/quiz' && request.method === 'GET') {
      const quiz = handleGetQuiz();
      return quiz ? jsonResponse(quiz) : jsonResponse({ error: '퀴즈가 없습니다' }, 404);
    }
    if (pathname === '/api/quiz/answer' && request.method === 'POST') {
      const body = await request.json();
      return jsonResponse(handleQuizAnswer(body));
    }

    // --- ADMIN (password required) ---
    const adminErr = checkAdmin(request);
    const isAdminPath = pathname.startsWith('/api/admin');
    if (isAdminPath && adminErr) return adminErr;

    // Cats admin
    if (pathname === '/api/admin/cats' && request.method === 'POST') return jsonResponse(await handleAdminAddCat(request));
    if (pathname.match(/^\/api\/admin\/cats\/[\w-]+$/) && request.method === 'PUT') {
      return jsonResponse(await handleAdminUpdateCat(request, pathname.slice('/api/admin/cats/'.length)));
    }
    if (pathname.match(/^\/api\/admin\/cats\/[\w-]+$/) && request.method === 'DELETE') {
      return jsonResponse(await handleAdminDeleteCat(pathname.slice('/api/admin/cats/'.length)));
    }

    // Quizzes admin
    if (pathname === '/api/admin/quizzes' && request.method === 'GET') return jsonResponse(quizzesJson);
    if (pathname === '/api/admin/quizzes' && request.method === 'POST') return jsonResponse(await handleAdminAddQuiz(request));
    if (pathname.match(/^\/api\/admin\/quizzes\/[\w-]+$/) && request.method === 'PUT') {
      return jsonResponse(await handleAdminUpdateQuiz(request, pathname.slice('/api/admin/quizzes/'.length)));
    }
    if (pathname.match(/^\/api\/admin\/quizzes\/[\w-]+$/) && request.method === 'DELETE') {
      return jsonResponse(await handleAdminDeleteQuiz(pathname.slice('/api/admin/quizzes/'.length)));
    }

    // Coupons admin
    if (pathname === '/api/admin/coupons' && request.method === 'GET') return jsonResponse(coupons);
    if (pathname === '/api/admin/coupons/redeem' && request.method === 'POST') {
      const { code } = await request.json();
      const coupon = coupons.find(c => c.code === code);
      if (!coupon) return jsonResponse({ error: '쿠폰을 찾을 수 없습니다' }, 404);
      if (coupon.used) return jsonResponse({ error: '이미 사용된 쿠폰' }, 400);
      coupon.used = true;
      coupon.usedAt = new Date().toISOString();
      await saveCoupons();
      return jsonResponse({ success: true, coupon });
    }

    // Static
    return serveStatic(pathname);
  },
});

console.log(`🐱 Cat Chat server running on http://localhost:${PORT}`);
console.log(`   Cats: ${catsJson.cats.map(c => `${c.emoji} ${c.name}`).join(', ')}`);
console.log(`   Quizzes: ${quizzesJson.filter(q => q.active).length} active`);
