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
  bubble.textContent = text;

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
