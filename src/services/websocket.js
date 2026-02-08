let socket = null;
const listeners = {};

const WebSocketService = {
  connect(token) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.warn("⚠️ WebSocket already connected");
      return;
    }

    console.log("🔌 Connecting WebSocket...");
    socket = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    socket.onopen = () => console.log("✅ WebSocket connected");
    socket.onerror = (e) => console.error("❌ WebSocket error", e);
    socket.onclose = () => console.warn("⚠️ WebSocket closed");

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      listeners[msg.type]?.forEach(cb => cb(msg));
    };
  },

  on(type, cb) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(cb);
  },

  send(payload) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  },

  disconnect() {
    socket?.close();
    socket = null;
  }
};

export default WebSocketService;
