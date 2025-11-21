// Initialize Socket.IO
const socket = io();

// DOMs
const introScreen = document.getElementById('intro-screen');
const conversationScreen = document.getElementById('conversation-screen');
const endingScreen = document.getElementById('ending-screen');

const beginBtn = document.getElementById('begin-btn');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');

const memoryFill = document.getElementById('memory-fill');
const memoryPercent = document.getElementById('memory-percent');

const totalMessagesEl = document.getElementById('total-messages');
const preservedMessagesEl = document.getElementById('preserved-messages');
const lostMessagesEl = document.getElementById('lost-messages');
const restartBtn = document.getElementById('restart-btn');

// State
let messages = [];
let isAIThinking = false;

// Start convo
beginBtn.addEventListener('click', () => {
  showScreen('conversation');
});

// Send message on button click
sendBtn.addEventListener('click', () => {
  sendMessage();
});

// Send message on Enter (Shift+Enter for new line)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Stop conversation
stopBtn.addEventListener('click', () => {
  socket.emit('stop-conversation');
});

// Restart
restartBtn.addEventListener('click', () => {
  location.reload();
});

// Send user message
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isAIThinking) return;

  socket.emit('user-message', { message: text });
  messageInput.value = '';
  messageInput.style.height = 'auto';
  
  isAIThinking = true;
  sendBtn.disabled = true;
  showTypingIndicator();
}

// Socket event: User message confirmed
socket.on('user-message-confirmed', (data) => {
  addMessage(data.content, 'user', data.index, data.fadeLevel);
});

// Socket event: AI message
socket.on('ai-message', (data) => {
  removeTypingIndicator();
  addMessage(data.content, 'ai', data.index, data.fadeLevel);
  isAIThinking = false;
  sendBtn.disabled = false;
  messageInput.focus();
});

// Socket event: Fade messages
socket.on('fade-messages', (fadeUpdates) => {
  fadeUpdates.forEach(update => {
    const messageEl = document.querySelector(`[data-index="${update.index}"]`);
    if (messageEl) {
      messageEl.style.opacity = update.fadeLevel;
      
      // Add visual corruption classes
      messageEl.classList.remove('fading', 'very-faded', 'corrupted');
      
      if (update.fadeLevel < 0.2) {
        messageEl.classList.add('corrupted');
      } else if (update.fadeLevel < 0.4) {
        messageEl.classList.add('very-faded');
      } else if (update.fadeLevel < 0.7) {
        messageEl.classList.add('fading');
      }

      // Optionally corrupt text content
      if (update.shouldCorrupt && update.fadeLevel < 0.3) {
        corruptMessageText(messageEl);
      }
    }
  });

  // Update memory indicator
  updateMemoryIndicator();
});

// Socket event: AI error
socket.on('ai-error', (data) => {
  removeTypingIndicator();
  alert(data.message);
  isAIThinking = false;
  sendBtn.disabled = false;
});

// Socket event: Conversation stopped
socket.on('conversation-stopped', (data) => {
  const preserved = data.preservedMessages.length;
  const total = data.messageCount;
  const lost = total - preserved;

  totalMessagesEl.textContent = total;
  preservedMessagesEl.textContent = preserved;
  lostMessagesEl.textContent = lost;

  showScreen('ending');
});

// Add message to conversation
function addMessage(content, role, index, fadeLevel) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;
  messageEl.dataset.index = index;
  messageEl.style.opacity = fadeLevel;

  const roleLabel = document.createElement('div');
  roleLabel.className = 'message-role';
  roleLabel.textContent = role === 'ai' ? 'AI' : 'You';

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.textContent = content;

  messageEl.appendChild(roleLabel);
  messageEl.appendChild(contentEl);
  messagesContainer.appendChild(messageEl);

  messages.push({ content, role, index, fadeLevel, element: messageEl });

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message ai typing-indicator';
  indicator.id = 'typing-indicator';
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'typing-dot';
    indicator.appendChild(dot);
  }
  
  messagesContainer.appendChild(indicator);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Remove typing indicator
function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Corrupt message text (visual glitch effect)
function corruptMessageText(messageEl) {
  const contentEl = messageEl.querySelector('.message-content');
  if (!contentEl) return;

  const originalText = contentEl.textContent;
  const chars = originalText.split('');
  
  // Randomly replace some characters
  const corrupted = chars.map(char => {
    if (Math.random() > 0.7) {
      const glitchChars = ['█', '▓', '▒', '░', '·', '…', ' '];
      return glitchChars[Math.floor(Math.random() * glitchChars.length)];
    }
    return char;
  }).join('');

  contentEl.textContent = corrupted;
}

// Update memory integrity indicator
function updateMemoryIndicator() {
  // Calculate average fade level of all messages
  const visibleMessages = messages.filter(msg => msg.element && msg.element.style.opacity > 0);
  
  if (visibleMessages.length === 0) {
    memoryFill.style.width = '0%';
    memoryPercent.textContent = '0%';
    return;
  }

  const totalOpacity = visibleMessages.reduce((sum, msg) => {
    return sum + parseFloat(msg.element.style.opacity || 1);
  }, 0);

  const avgOpacity = totalOpacity / messages.length;
  const percentage = Math.round(avgOpacity * 100);

  memoryFill.style.width = `${percentage}%`;
  memoryPercent.textContent = `${percentage}%`;

  // Change color if memory is critical
  if (percentage < 30) {
    memoryFill.classList.add('critical');
  } else {
    memoryFill.classList.remove('critical');
  }
}

// Screen management
function showScreen(screenName) {
  const screens = {
    'intro': introScreen,
    'conversation': conversationScreen,
    'ending': endingScreen,
  };

  Object.values(screens).forEach(screen => {
    screen.classList.remove('active');
  });

  screens[screenName].classList.add('active');
}

// Auto-resize textarea
messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
});

// Initial focus
setTimeout(() => {
  if (conversationScreen.classList.contains('active')) {
    messageInput.focus();
  }
}, 100);
