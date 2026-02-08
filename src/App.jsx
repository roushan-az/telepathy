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
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);

  const wsConnectedRef = useRef(false);

  // WebRTC state
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [inCall, setInCall] = useState(false);

  /* -------------------- Bootstrap Auth -------------------- */
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

        setUser(data.user);
        setToken(storedToken);
      } else {
        setUser({ userId: storedUserId, name: "Anonymous" });
        setToken(storedToken);
      }
    };

    bootstrap();
  }, []);

  /* -------------------- WebSocket (SINGLE SOURCE OF TRUTH) -------------------- */
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

  /* -------------------- Messaging -------------------- */
  const handleIncomingMessage = (msg) => {
    setMessages((prev) => [...prev, msg]);
  };

  const sendMessage = (text) => {
    if (!selectedChat) return;

    WebSocketService.send({
      type: "MESSAGE",
      to: selectedChat.id,
      payload: text
    });
  };

  /* -------------------- WebRTC -------------------- */
  const startCall = async (video = false) => {
    if (!selectedChat) return;
    setInCall(true);

    await createPeerConnection(
      (candidate) =>
        WebSocketService.send({
          type: "ICE",
          to: selectedChat.id,
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
      to: selectedChat.id,
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

  return (
    <div className="app-container">
      <Sidebar
        user={user}
        chats={chats}
        onSelectChat={setSelectedChat}
        selectedChat={selectedChat}
      />

      <ChatWindow
        messages={messages}
        onSend={sendMessage}
        onCallAudio={() => startCall(false)}
        onCallVideo={() => startCall(true)}
        inCall={inCall}
        onEndCall={endCall}
      />

      {localStream && (
        <video autoPlay muted playsInline ref={(v) => v && (v.srcObject = localStream)} />
      )}

      {remoteStream && (
        <video autoPlay playsInline ref={(v) => v && (v.srcObject = remoteStream)} />
      )}
    </div>
  );
}

export default App;
