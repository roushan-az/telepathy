// services/websocket.js - Fixed PING handling

import ChunkHandler from "./chunkHandler";

class WebSocketService {
  constructor() {
    this.socket = null;
    this.token = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.chunkHandler = new ChunkHandler();
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  connect(token) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      console.log('⏳ Connection already in progress');
      return;
    }

    this.isConnecting = true;
    this.token = token;
    const wsUrl = `ws://localhost:8080/ws?token=${token}`;

    console.log('🔌 Connecting to WebSocket...');

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('✅ WebSocket connected (streaming mode)');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.processMessageQueue();
        this.emit('connected');
      };

      this.socket.onmessage = (event) => {
        try {
          // Handle chunked messages
          const message = this.chunkHandler.handleMessage(event.data, (completeMessage) => {
            // Chunk assembly complete, process it
            this.processMessage(completeMessage);
          });

          // If message is not null, it's a regular (non-chunked) message
          if (message) {
            this.processMessage(message);
          }

        } catch (error) {
          console.error('❌ Error processing message:', error);
        }
      };

      this.socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
        this.emit('error', error);
      };

      this.socket.onclose = (event) => {
        console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`);
        this.isConnecting = false;
        this.socket = null;
        
        // Clean up chunk handler
        this.chunkHandler.cleanup();
        
        this.emit('disconnected', event);

        // Auto-reconnect if needed
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('❌ Max reconnection attempts reached');
          this.emit('reconnect_failed');
        }
      };

    } catch (error) {
      console.error('❌ Error creating WebSocket:', error);
      this.isConnecting = false;
      this.reconnect();
    }
  }

  processMessage(message) {
    const { type, ...data } = message;

    // Handle special message types
    if (type === 'ERROR') {
      console.error('❌ Server error:', data.message);
      this.emit('error', data);
      return;
    }

    if (type === 'PONG') {
      console.log('💚 Pong received from server');
      return;
    }

    // Emit to registered listeners
    this.emit(type, data);
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect(this.token);
      }
    }, delay);
  }

  /**
   * IMPROVED: Validate message has recipient before sending
   * Special handling for PING messages (no recipient needed)
   */
  send(message) {
    // PING messages don't need a recipient - they're handled by the server heartbeat
    if (message.type === 'PING') {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      
      try {
        // Send PING without recipient - server handles it specially
        this.socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('❌ Error sending ping:', error);
        return false;
      }
    }

    // All other messages need a recipient
    if (!message.to && !message.recipientId && !message.peerId) {
      console.error('❌ Cannot send message without recipient!');
      console.error('   Message:', message);
      console.error('   Please include "to", "recipientId", or "peerId" field');
      
      // Show helpful error to user
      this.emit('error', {
        message: 'Message missing recipient field',
        details: 'Add a "to" field with the recipient user ID'
      });
      
      return false;
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not open, queueing message');
      this.messageQueue.push(message);
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      
      // Log large messages
      if (messageStr.length > 50000) {
        console.log(`📨 Sending large message: ${messageStr.length} bytes, type: ${message.type}`);
      }

      this.socket.send(messageStr);
      return true;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      this.messageQueue.push(message);
      return false;
    }
  }

  // ============================================
  // HELPER METHODS - Use these in your components
  // ============================================

  /**
   * Send a text message to a specific user
   */
  sendTextMessage(recipientId, content) {
    return this.send({
      type: 'text',
      to: recipientId,
      content: content,
      timestamp: Date.now()
    });
  }

  /**
   * Send a file to a specific user
   */
  sendFile(recipientId, file, fileData) {
    return this.send({
      type: 'file',
      to: recipientId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      fileData: fileData,
      timestamp: Date.now()
    });
  }

  /**
   * Send WebRTC offer (start call)
   */
  sendOffer(recipientId, sdp) {
    return this.send({
      type: 'offer',
      to: recipientId,
      sdp: sdp,
      timestamp: Date.now()
    });
  }

  /**
   * Send WebRTC answer (accept call)
   */
  sendAnswer(recipientId, sdp) {
    return this.send({
      type: 'answer',
      to: recipientId,
      sdp: sdp,
      timestamp: Date.now()
    });
  }

  /**
   * Send ICE candidate
   */
  sendIceCandidate(recipientId, candidate) {
    return this.send({
      type: 'ice-candidate',
      to: recipientId,
      candidate: candidate,
      timestamp: Date.now()
    });
  }

  /**
   * Send typing indicator
   */
  sendTyping(recipientId, isTyping) {
    return this.send({
      type: 'typing',
      to: recipientId,
      isTyping: isTyping,
      timestamp: Date.now()
    });
  }

  /**
   * Send call status (ringing, busy, etc.)
   */
  sendCallStatus(recipientId, status) {
    return this.send({
      type: 'call-status',
      to: recipientId,
      status: status,
      timestamp: Date.now()
    });
  }

  processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    console.log(`📤 Processing ${this.messageQueue.length} queued messages...`);

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }

    this.isProcessingQueue = false;
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      delete this.listeners[event];
    }
  }

  emit(event, data) {
    const callbacks = this.listeners[event] || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ Error in ${event} listener:`, error);
      }
    });
  }

  disconnect() {
    console.log('🔴 Disconnecting WebSocket...');
    this.shouldReconnect = false;
    this.chunkHandler.cleanup();
    
    if (this.socket) {
      this.socket.close(1000, 'Client disconnecting');
      this.socket = null;
    }
    
    this.messageQueue = [];
  }

  getConnectionState() {
    if (!this.socket) return 'DISCONNECTED';
    
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  getStats() {
    return {
      connectionState: this.getConnectionState(),
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      chunkStats: this.chunkHandler.getStats()
    };
  }

  // Send heartbeat/ping to keep connection alive
  // FIXED: PING doesn't need a recipient
  sendPing() {
    this.send({ type: 'PING', timestamp: Date.now() });
  }
}

// Singleton instance
const instance = new WebSocketService();

// Auto-ping every 25 seconds to keep connection alive
setInterval(() => {
  if (instance.getConnectionState() === 'OPEN') {
    instance.sendPing();
  }
}, 25000);

export default instance;