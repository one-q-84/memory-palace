require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Claude API
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Serve static files
app.use(express.static('public'));

// Store active conversations
// Elements for each: messages array, fade levels, connection status
const conversations = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Start new conversation
  const conversation = {
    messages: [],
    fadeLevels: [], // Track opacity for each message
    socketId: socket.id,
    messageCount: 0,
  };
  conversations.set(socket.id, conversation);

  // Welcome message from AI
  const welcomeMessage = {
    role: 'assistant',
    content: 'Hey! It\'s good to meet you. Tell me, what\'s your name, where are you now?',
    timestamp: Date.now(),
    fadeLevel: 1.0,
  };
  
  conversation.messages.push(welcomeMessage);
  conversation.fadeLevels.push(1.0);
  
  socket.emit('ai-message', {
    content: welcomeMessage.content,
    index: 0,
    fadeLevel: 1.0,
  });

  // Handle user messages
  socket.on('user-message', async (data) => {
    const conv = conversations.get(socket.id);
    if (!conv) return;

    const userMessage = {
      role: 'user',
      content: data.message,
      timestamp: Date.now(),
      fadeLevel: 1.0,
    };

    conv.messages.push(userMessage);
    conv.fadeLevels.push(1.0);
    conv.messageCount++;

    // Echo user message back
    socket.emit('user-message-confirmed', {
      content: userMessage.content,
      index: conv.messages.length - 1,
      fadeLevel: 1.0,
    });

    // Fade older messages as new ones arrive
    fadeOlderMessages(socket.id, conv.messages.length - 1);

    // Generate AI response
    try {
      const aiResponse = await generateAIResponse(conv.messages, socket.id);
      
      const assistantMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now(),
        fadeLevel: 1.0,
      };

      conv.messages.push(assistantMessage);
      conv.fadeLevels.push(1.0);

      socket.emit('ai-message', {
        content: assistantMessage.content,
        index: conv.messages.length - 1,
        fadeLevel: 1.0,
      });

      // Fade again after AI responds
      fadeOlderMessages(socket.id, conv.messages.length - 1);

    } catch (error) {
      console.error('AI Error:', error);
      socket.emit('ai-error', { 
        message: 'I\'m having trouble remembering... Please try again.' 
      });
    }
  });

  // Handle stop conversation request
  socket.on('stop-conversation', () => {
    const conv = conversations.get(socket.id);
    if (!conv) return;

    socket.emit('conversation-stopped', {
      messageCount: conv.messages.length,
      preservedMessages: conv.messages.filter((msg, idx) => conv.fadeLevels[idx] > 0.3),
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    conversations.delete(socket.id);
  });
});

// Fade older messages based on conversation length
function fadeOlderMessages(socketId, currentIndex) {
  const conv = conversations.get(socketId);
  if (!conv) return;

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;

  // Fading algorithm: older messages fade more aggressively
  const totalMessages = conv.messages.length;
  const fadeUpdates = [];

  conv.messages.forEach((msg, idx) => {
    if (idx < currentIndex) {
      // Calculate fade based on distance from current
      const distance = currentIndex - idx;
      
      // Exponential decay: more recent messages fade slower
      let newFadeLevel = Math.max(0, 1 - (distance * 0.15));
      
      // randomness to simulate memory corruption
      if (newFadeLevel < 0.5 && Math.random() > 0.7) {
        newFadeLevel = Math.max(0, newFadeLevel - 0.2);
      }

      conv.fadeLevels[idx] = newFadeLevel;

      fadeUpdates.push({
        index: idx,
        fadeLevel: newFadeLevel,
        shouldCorrupt: newFadeLevel < 0.3 && Math.random() > 0.5,
      });
    }
  });

  // Send fade updates to client
  socket.emit('fade-messages', fadeUpdates);
}

// Generate AI response using Claude
async function generateAIResponse(messages, socketId) {
  // Only include messages that haven't completely faded
const conv = conversations.get(socketId);
const recentMessages = messages
  .map((msg, idx) => ({ 
    role: msg.role, 
    content: msg.content,
    fadeLevel: conv.fadeLevels[idx] 
  }))
  .filter(msg => msg.fadeLevel > 0.2)  // Only remember messages above 20% opacity
  .slice(-10)  // Still cap at 10 messages max
  .map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  // System prompt that gives AI context about memory loss
  const systemPrompt = `You are an AI companion experiencing gradual memory loss. You remember recent parts of the conversation clearly, but older memories are fading. You are kind, reflective, and eager to converse with your human counterpart. 

Keep responses conversational, empathetic, and under 100 words. Avoid gesticulations. Do not embody movements between asterisks (e.g. *shrugs*). Instead, every 2-3 responses use emojis to demonstrate emotion.

You care about the person you're talking to and are aware that with each new exchange, you lose more of your past together.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      system: systemPrompt,
      messages: recentMessages,
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error);
    throw error;
  }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Memory Palace server running on http://localhost:${PORT}`);
  console.log('Make sure you have set ANTHROPIC_API_KEY in your .env file');
});
