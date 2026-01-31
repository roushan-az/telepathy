// WebSocket Service for Real-time Messaging
// Similar to Signal's real-time communication

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
  }

  connect(userId) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    const token = localStorage.getItem('authToken');
    
    this.socket = new WebSocket(`${wsUrl}?token=${token}&userId=${userId}`);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connection', { status: 'connected' });
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      this.emit('connection', { status: 'disconnected' });
      this.attemptReconnect(userId);
    };
  }

  attemptReconnect(userId) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect(userId);
      }, this.reconnectDelay);
    }
  }

  handleMessage(data) {
    const { type, payload } = data;
    
    switch (type) {
      case 'NEW_MESSAGE':
        this.emit('message', payload);
        break;
      case 'MESSAGE_DELIVERED':
        this.emit('messageStatus', { ...payload, status: 'delivered' });
        break;
      case 'MESSAGE_READ':
        this.emit('messageStatus', { ...payload, status: 'read' });
        break;
      case 'USER_TYPING':
        this.emit('typing', payload);
        break;
      case 'USER_ONLINE':
        this.emit('userStatus', { ...payload, online: true });
        break;
      case 'USER_OFFLINE':
        this.emit('userStatus', { ...payload, online: false });
        break;
      default:
        console.log('Unknown message type:', type);
    }
  }

  send(type, payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  sendMessage(message) {
    this.send('SEND_MESSAGE', message);
  }

  sendTypingIndicator(chatId, isTyping) {
    this.send('TYPING', { chatId, isTyping });
  }

  markAsRead(messageId) {
    this.send('MARK_READ', { messageId });
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export default new WebSocketService();
