export function connectSocket(token, onMessage) {
  const ws = new WebSocket("wss://your-server/ws", [
    "Authorization",
    `Bearer ${token}`
  ]);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    onMessage(msg);
  };

  return ws;
}
