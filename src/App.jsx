import { useEffect, useRef, useState } from "react";
import ChatWindow from "./components/ChatWindow.jsx";
import Sidebar from "./components/Sidebar.jsx";
import "./App.css";
import WebSocketService from "./services/websocket";

// WebRTC helpers
import {
  createPeerConnection,
  getUserMedia,
  addTracks,
  createOffer,
  createAnswer,
  setRemoteAnswer,
  addIceCandidate,
  closeConnection
} from "./services/webrtc";

function App() {
  /* -------------------- USER -------------------- */
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  /* -------------------- DUMMY USERS -------------------- */
  const DUMMY_USERS = [
    { id: "user-1", name: "Alice", online: true },
    { id: "user-2", name: "Bob", online: true }
  ];

  const [currentUser] = useState(DUMMY_USERS[0]); // Alice

  /* -------------------- CHATS -------------------- */
  const [chats, setChats] = useState([
    {
      id: "chat-1",
      name: "Bob",
      peerId: "user-2",
      online: true,
      messages: []
    }
  ]);

  const [selectedChat, setSelectedChat] = useState(chats[0]);

  /* -------------------- WebRTC -------------------- */
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [inCall, setInCall] = useState(false);

  const wsConnectedRef = useRef(false);

  /* -------------------- BOOTSTRAP AUTH -------------------- */
  useEffect(() => {
    const bootstrap = async () => {
      let storedToken = localStorage.getItem("token");
      let storedUserId = localStorage.getItem("userId");

      if (!storedToken) {
        const res = await fetch("http://localhost:8080/api/auth/anonymous", {
          method: "POST"
        });
        const data = await res.json();

        storedToken = data.accessToken;
        storedUserId = data.user.userId;

        localStorage.setItem("token", storedToken);
        localStorage.setItem("userId", storedUserId);

        setUser({ id: storedUserId, name: "Anonymous" });
        setToken(storedToken);
      } else {
        setUser({ id: storedUserId, name: "Anonymous" });
        setToken(storedToken);
      }
    };

    bootstrap();
  }, []);

  /* -------------------- WEBSOCKET (ONCE) -------------------- */
  useEffect(() => {
    if (!token) return;
    if (wsConnectedRef.current) return;

    wsConnectedRef.current = true;
    WebSocketService.connect(token);

    WebSocketService.on("MESSAGE", handleIncomingMessage);
    WebSocketService.on("OFFER", handleOffer);
    WebSocketService.on("ANSWER", handleAnswer);
    WebSocketService.on("ICE", handleIce);

    return () => {
      wsConnectedRef.current = false;
      WebSocketService.disconnect();
    };
  }, [token]);

  /* -------------------- MESSAGING -------------------- */
  const handleSendMessage = (text) => {
    if (!selectedChat) return;

    const message = {
      id: crypto.randomUUID(),
      senderId: currentUser.id,
      content: text,
      timestamp: new Date(),
      status: "sent"
    };

    // Optimistic update
    setChats(prev =>
      prev.map(chat =>
        chat.id === selectedChat.id
          ? { ...chat, messages: [...chat.messages, message] }
          : chat
      )
    );

    // WebSocket
    WebSocketService.send({
      type: "MESSAGE",
      to: selectedChat.peerId,
      payload: message
    });
  };

  const handleIncomingMessage = (msg) => {
    const incoming = {
      id: crypto.randomUUID(),
      senderId: msg.from,
      content: msg.payload?.content || msg.payload,
      timestamp: new Date(),
      status: "delivered"
    };

    setChats(prev =>
      prev.map(chat =>
        chat.peerId === msg.from
          ? { ...chat, messages: [...chat.messages, incoming] }
          : chat
      )
    );
  };

  /* -------------------- WEBRTC -------------------- */
  const startCall = async (video = false) => {
    if (!selectedChat) return;
    setInCall(true);

    await createPeerConnection(
      (candidate) =>
        WebSocketService.send({
          type: "ICE",
          to: selectedChat.peerId,
          candidate
        }),
      (stream) => setRemoteStream(stream)
    );

    const stream = await getUserMedia(true, video);
    setLocalStream(stream);
    addTracks();

    const offer = await createOffer();
    WebSocketService.send({
      type: "OFFER",
      to: selectedChat.peerId,
      offer
    });
  };

  const handleOffer = async (msg) => {
    setInCall(true);

    await createPeerConnection(
      (candidate) =>
        WebSocketService.send({
          type: "ICE",
          to: msg.from,
          candidate
        }),
      (stream) => setRemoteStream(stream)
    );

    const stream = await getUserMedia(true, true);
    setLocalStream(stream);
    addTracks();

    const answer = await createAnswer(msg.offer);
    WebSocketService.send({
      type: "ANSWER",
      to: msg.from,
      answer
    });
  };

  const handleAnswer = async (msg) => {
    await setRemoteAnswer(msg.answer);
  };

  const handleIce = async (msg) => {
    if (msg?.candidate) {
      await addIceCandidate(msg.candidate);
    }
  };

  const endCall = () => {
    closeConnection();
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
  };

  /* -------------------- UI -------------------- */
  if (!user || !token) {
    return <div className="init-screen">Initializing secure session…</div>;
  }

  /* -------------------- Sidebar: Add Chat -------------------- */
const addChat = () => {
  const peerName = prompt("Enter user name (dummy):");
  if (!peerName) return;

  const peerId = crypto.randomUUID();

  const newChat = {
    id: peerId,
    participants: [currentUser.id, peerId],
    name: peerName,
    online: true,
    messages: []
  };

  setChats(prev => [...prev, newChat]);
  setSelectedChat(newChat);
};

return (
  <div className="app-container">
    <div className="sidebar-wrapper">
      <Sidebar
        chats={chats}
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
        onAddChat={addChat}
        currentUser={currentUser}
      />
    </div>

    <div className="chat-wrapper">
      <ChatWindow
        chat={selectedChat}
        messages={selectedChat?.messages || []}
        currentUser={currentUser}
        onSendMessage={handleSendMessage}
        inCall={inCall}          // ✅ FIXED
        startCall={startCall}    // ✅ FIXED
        endCall={endCall}        // ✅ FIXED
      />
    </div>

    {/* Video streams (unchanged) */}
    {localStream && (
      <video
        className="local-video"
        autoPlay
        muted
        playsInline
        ref={(v) => v && (v.srcObject = localStream)}
      />
    )}

    {remoteStream && (
      <video
        className="remote-video"
        autoPlay
        playsInline
        ref={(v) => v && (v.srcObject = remoteStream)}
      />
    )}
  </div>
);

}

export default App;
