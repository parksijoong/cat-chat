/**
 * Frontend logic for AI Cat Chat
 * Cafe Torcello - Multi-cat edition
 */

// DOM elements
const catSelector = document.getElementById('catSelector');
const catList = document.getElementById('catList');
const catAvatar = document.getElementById('catAvatar');
const catName = document.getElementById('catName');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const toast = document.getElementById('toast');
const clearBtn = document.getElementById('clearBtn');

// State
let isLoading = false;
let currentCatId = null;
let allCats = [];
let activeQuiz = null; // { id, question, hint }

// localStorage keys
const STORAGE_KEY = 'catchat_';

function getStorageKey(catId) {
  return `${STORAGE_KEY}${catId}`;
}

function saveHistory(catId, messages) {
  try {
    localStorage.setItem(getStorageKey(catId), JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

function loadHistory(catId) {
  try {
    const data = localStorage.getItem(getStorageKey(catId));
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load history:', e);
    return [];
  }
}

function clearHistory(catId) {
  localStorage.removeItem(getStorageKey(catId));
}

// Coupons
const COUPON_KEY = 'catchat_coupons';

function getSavedCoupons() {
  try {
    return JSON.parse(localStorage.getItem(COUPON_KEY) || '[]');
  } catch { return []; }
}

function saveCoupon(code) {
  const coupons = getSavedCoupons();
  if (!coupons.find(c => c.code === code)) {
    coupons.push({ code, savedAt: new Date().toISOString() });
    localStorage.setItem(COUPON_KEY, JSON.stringify(coupons));
  }
}

// Detect coupon code in response (pattern: TC-XXXX-XXXX)
const COUPON_REGEX = /TC-[A-Z0-9]{4}-[A-Z0-9]{4}/g;

function extractAndSaveCoupons(text) {
  const matches = text.match(COUPON_REGEX);
  if (matches) {
    matches.forEach(code => saveCoupon(code));
  }
  return matches || [];
}

/**
 * Show toast
 */
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/**
 * Add message to chat
 */
function addMessage(text, type, save = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  // Detect coupon codes in cat messages
  if (type === 'cat') {
    const coupons = extractAndSaveCoupons(text);
    if (coupons.length > 0) {
      // Replace coupon codes with styled spans
      let html = text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      coupons.forEach(code => {
        html = html.replace(code, `<div class="coupon-card"><div class="coupon-label">🎁 쿠폰 당첨!</div><div class="coupon-code">${code}</div><div class="coupon-hint">카페에서 이 코드를 보여주세요</div></div>`);
      });
      bubble.innerHTML = html;
    } else {
      bubble.textContent = text;
    }
  } else {
    bubble.textContent = text;
  }

  messageDiv.appendChild(bubble);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (save && currentCatId) {
    const history = loadHistory(currentCatId);
    history.push({ role: type === 'cat' ? 'assistant' : 'user', content: text });
    saveHistory(currentCatId, history);
  }
}

/**
 * Show typing indicator
 */
function showTyping() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message cat typing-indicator';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML = `
    <div class="typing">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

/**
 * Render cat selector
 */
function renderCatSelector(cats) {
  catList.innerHTML = '';
  cats.forEach(cat => {
    const option = document.createElement('div');
    option.className = `cat-option ${cat.id === currentCatId ? 'active' : ''}`;
    option.style.setProperty('--cat-color', cat.color || '#FFB6C1');
    option.style.setProperty('--cat-bg', `${cat.color || '#FFB6C1'}20`);
    option.dataset.catId = cat.id;
    option.innerHTML = `<span class="emoji">${cat.emoji}</span><span class="name">${cat.name}</span>`;
    option.addEventListener('click', () => selectCat(cat.id));
    catList.appendChild(option);
  });
}

/**
 * Select a cat
 */
function selectCat(catId) {
  if (catId === currentCatId) return;

  currentCatId = catId;
  const cat = allCats.find(c => c.id === catId);
  if (!cat) return;

  // Update profile
  catAvatar.textContent = cat.emoji;
  catAvatar.style.background = cat.color || '#FFD700';
  catName.textContent = cat.name;

  // Update selector active state
  document.querySelectorAll('.cat-option').forEach(el => {
    el.classList.toggle('active', el.dataset.catId === catId);
  });

  // Load chat history
  renderChatHistory(catId);
}

/**
 * Render chat history for a cat
 */
function renderChatHistory(catId) {
  chatMessages.innerHTML = '';
  const history = loadHistory(catId);

  if (history.length === 0) {
    const cat = allCats.find(c => c.id === catId);
    addMessage(cat.greeting, 'cat');
  } else {
    history.forEach(msg => {
      const type = msg.role === 'assistant' ? 'cat' : 'user';
      addMessage(msg.content, type, false);
    });
  }
}

/**
 * Load all cats from API
 */
async function loadCats() {
  try {
    const response = await fetch('/api/cats');
    if (!response.ok) throw new Error('Failed to load cats');
    allCats = await response.json();

    if (allCats.length === 0) {
      catName.textContent = '고양이가 없어요!';
      return;
    }

    // Render selector
    renderCatSelector(allCats);

    // Default to first cat (or saved selection)
    const savedCatId = localStorage.getItem(`${STORAGE_KEY}selected`);
    const initialCat = savedCatId && allCats.find(c => c.id === savedCatId)
      ? savedCatId
      : allCats[0].id;

    selectCat(initialCat);

  } catch (error) {
    console.error('Failed to load cats:', error);
    catName.textContent = '로딩 실패';
  }
}

/**
 * Get conversation history for API
 */
function getConversationHistory() {
  const history = loadHistory(currentCatId);
  // Send last 10 messages for context
  return history.slice(-10).map(h => ({
    role: h.role,
    content: h.content,
  }));
}

/**
 * Send message to AI
 */
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message || isLoading) return;

  addMessage(message, 'user');
  messageInput.value = '';
  isLoading = true;
  sendButton.disabled = true;

  // Check if answering an active quiz
  if (activeQuiz) {
    removeTyping();
    await handleQuizAnswer(message);
    return;
  }

  // Check if requesting a quiz
  if (/퀴즈|문제|퀴즈|도전/.test(message)) {
    await handleQuizStart();
    return;
  }

  showTyping();

  try {
    const response = await fetch(`/api/chat/${currentCatId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: getConversationHistory(),
      }),
    });

    removeTyping();

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get response');
    }

    const data = await response.json();
    addMessage(data.reply, 'cat');

  } catch (error) {
    removeTyping();
    console.error('Chat error:', error);
    showToast(error.message || '다시 시도해주세요!');
  } finally {
    isLoading = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

/**
 * Start a quiz
 */
async function handleQuizStart() {
  try {
    const res = await fetch('/api/quiz');
    if (!res.ok) throw new Error('퀴즈가 없습니다');
    const quiz = await res.json();
    activeQuiz = quiz;

    const cat = allCats.find(c => c.id === currentCatId);
    const quizMsg = `${cat.emoji} 퀴즈타임이냥!\n\n❓ ${quiz.question}\n\n💡 힌트: ${quiz.hint}`;
    addMessage(quizMsg, 'cat');
  } catch (e) {
    addMessage('지금은 퀴즈가 준비 안 됐냥... 나중에 다시 와냥! 😿', 'cat');
  } finally {
    isLoading = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

/**
 * Handle quiz answer
 */
async function handleQuizAnswer(answer) {
  try {
    const res = await fetch('/api/quiz/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId: activeQuiz.id, answer }),
    });
    const result = await res.json();

    if (result.correct) {
      addMessage(`🎉 정답이냥!! 축하한다냥!\n\n🎁 쿠폰 코드: ${result.code}\n카페에서 이 코드를 보여주면 혜택을 받을 수 있냥!`, 'cat');
    } else {
      addMessage(`아쉽다냥... 😿 정답은 「${result.answer}」이었냥! 다음에 다시 도전하냥!`, 'cat');
    }
  } catch {
    addMessage('오류가 났다냥... 다시 시도해냥! 😿', 'cat');
  } finally {
    activeQuiz = null;
    isLoading = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

/**
 * Handle Enter key
 */
function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

/**
 * Clear chat for current cat
 */
function handleClear() {
  if (!currentCatId) return;
  clearHistory(currentCatId);
  const cat = allCats.find(c => c.id === currentCatId);
  chatMessages.innerHTML = '';
  addMessage(cat.greeting, 'cat');
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', handleKeyPress);
clearBtn.addEventListener('click', handleClear);

// Save selected cat on change
const originalSelectCat = selectCat;
selectCat = function(catId) {
  localStorage.setItem(`${STORAGE_KEY}selected`, catId);
  originalSelectCat(catId);
};

// Initialize
loadCats();
