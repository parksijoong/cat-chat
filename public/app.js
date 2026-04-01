/**
 * Frontend logic for AI Cat Chat
 * Cafe Torcello - AI Cat Chat Experience
 */

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const catAvatar = document.getElementById('catAvatar');
const catName = document.getElementById('catName');
const catPersona = document.getElementById('catPersona');
const toast = document.getElementById('toast');

// API base URL (relative for same-origin)
const API_BASE = '';

// State
let isLoading = false;

/**
 * Show toast message
 */
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * Add message to chat
 */
function addMessage(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;

  messageDiv.appendChild(bubble);
  chatMessages.appendChild(messageDiv);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Show typing indicator
 */
function showTyping() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message cat typing-indicator';
  typingDiv.innerHTML = `
    <div class="typing">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return typingDiv;
}

/**
 * Remove typing indicator
 */
function removeTyping(typingElement) {
  if (typingElement && typingElement.parentNode) {
    typingElement.parentNode.removeChild(typingElement);
  }
}

/**
 * Load cat data
 */
async function loadCatData() {
  try {
    const response = await fetch(`${API_BASE}/api/cat`);
    if (!response.ok) {
      throw new Error('Failed to load cat data');
    }
    const cat = await response.json();

    catAvatar.textContent = cat.emoji;
    catName.textContent = cat.name;
    catPersona.textContent = cat.greeting || '';

    // Clear initial greeting and add cat's greeting
    chatMessages.innerHTML = '';
    addMessage(cat.greeting, 'cat');

  } catch (error) {
    console.error('Failed to load cat data:', error);
    catName.textContent = '몽글';
    catPersona.textContent = '햇살처럼 따뜻한 고양이';
  }
}

/**
 * Send message to AI
 */
async function sendMessage() {
  const message = messageInput.value.trim();

  if (!message || isLoading) {
    return;
  }

  // Add user message
  addMessage(message, 'user');
  messageInput.value = '';
  isLoading = true;
  sendButton.disabled = true;

  // Show typing indicator
  const typingElement = showTyping();

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    removeTyping(typingElement);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get response');
    }

    const data = await response.json();
    addMessage(data.reply, 'cat');

  } catch (error) {
    removeTyping(typingElement);
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

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', handleKeyPress);

// Initialize
loadCatData();
