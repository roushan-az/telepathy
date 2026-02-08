const listeners = {};

const WebSocketService = {
  socket: null,

  connect(token) {
    if (this.socket) return;

    console.log("🔌 Connecting WebSocket...");
    this.socket = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      listeners[msg.type]?.forEach(cb => cb(msg));
    };

    this.socket.onopen = () => console.log("✅ WebSocket connected");
    this.socket.onerror = () => console.log("❌ WebSocket error");
    this.socket.onclose = () => {
      console.log("⚠️ WebSocket closed");
      this.socket = null;
    };
  },

  on(type, cb) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(cb);
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
