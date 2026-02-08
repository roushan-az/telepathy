const listeners = {};

const WebSocketService = {
  socket: null,

  connect(token) {
    if (this.socket) return;

    console.log("🔌 Connecting WebSocket...");
    this.socket = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log("📨 Raw WebSocket message:", msg);
      listeners[msg.type]?.forEach(cb => cb(msg));
    };

    this.socket.onopen = () => console.log("✅ WebSocket connected");
    this.socket.onerror = (error) => console.log("❌ WebSocket error:", error);
    this.socket.onclose = () => {
      console.log("⚠️ WebSocket closed");
      this.socket = null;
    };
  },

  on(type, cb) {
    if (!listeners[type]) {
      listeners[type] = [];
    }
    // Prevent duplicate listeners
    if (!listeners[type].includes(cb)) {
      listeners[type].push(cb);
      console.log(`✅ Registered listener for ${type}, total: ${listeners[type].length}`);
    } else {
      console.log(`⚠️ Duplicate listener prevented for ${type}`);
    }
  },

  off(type, cb) {
    if (!listeners[type]) return;
    listeners[type] = listeners[type].filter(listener => listener !== cb);
  },

  clearAllListeners() {
    Object.keys(listeners).forEach(key => {
      listeners[key] = [];
    });
  },

  send(payload) {
    this.socket?.send(JSON.stringify(payload));
  },

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }
};

export default WebSocketService;