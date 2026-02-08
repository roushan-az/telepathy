import { useEffect, useRef, useState, useCallback } from "react";
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

  /* -------------------- DEMO PEER MAPPING -------------------- */
  const [peerUserId, setPeerUserId] = useState(null);
  const [peerName, setPeerName] = useState(null);

  /* -------------------- CHATS -------------------- */
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  
  // Keep a ref to chats for immediate access in callbacks
  const chatsRef = useRef([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  // Derive selectedChat from chats array to always have latest version
  const selectedChat = chats.find(c => c.id === selectedChatId) || chats[0];

  /* -------------------- WebRTC -------------------- */
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [inCall, setInCall] = useState(false);

  const wsConnectedRef = useRef(false);
  const handlersRegisteredRef = useRef(false);

  /* -------------------- BOOTSTRAP AUTH -------------------- */
  useEffect(() => {
    const bootstrap = async () => {
      const params = new URLSearchParams(window.location.search);
      const userParam = params.get("user");

      let storedToken = localStorage.getItem(`token_${userParam}`);
      let storedUserId = localStorage.getItem(`userId_${userParam}`);

      if (!storedToken) {
        console.log("🔐 Creating new anonymous user...");
        const res = await fetch("http://localhost:8080/api/auth/anonymous", {
          method: "POST"
        });
        const data = await res.json();

        storedToken = data.accessToken;
        storedUserId = data.user.userId;

        localStorage.setItem(`token_${userParam}`, storedToken);
        localStorage.setItem(`userId_${userParam}`, storedUserId);

        console.log(`✅ User created: ${storedUserId}`);
      } else {
        console.log(`✅ User loaded: ${storedUserId}`);
      }

      setUser({ id: storedUserId, name: userParam === "alice" ? "Alice" : "Bob" });
      setToken(storedToken);

      // Setup peer based on URL parameter
      if (userParam === "alice") {
        const bobUserId = localStorage.getItem("userId_bob");
        if (bobUserId) {
          setPeerUserId(bobUserId);
          setPeerName("Bob");
        }
      } else if (userParam === "bob") {
        const aliceUserId = localStorage.getItem("userId_alice");
        if (aliceUserId) {
          setPeerUserId(aliceUserId);
          setPeerName("Alice");
        }
      }
    };

    bootstrap();
  }, []);

  /* -------------------- INITIALIZE DEFAULT CHAT -------------------- */
  useEffect(() => {
    if (!user || !peerUserId) return;

    console.log(`📱 Setting up chat: ${user.name} → ${peerName} (${peerUserId})`);

    const defaultChat = {
      id: "chat-1",
      peerId: peerUserId,
      name: peerName,
      participants: [user.id, peerUserId],
      online: true,
      messages: [],
      lastMessage: "",
      lastTimestamp: null,
      unreadCount: 0
    };

    setChats([defaultChat]);
    setSelectedChatId("chat-1");
  }, [user, peerUserId, peerName]);

  /* -------------------- WEBSOCKET (ONCE) -------------------- */
  useEffect(() => {
    if (!token) return;
    if (wsConnectedRef.current) return;

    wsConnectedRef.current = true;
    WebSocketService.connect(token);

    return () => {
      wsConnectedRef.current = false;
      WebSocketService.disconnect();
    };
  }, [token]);

  /* -------------------- WEBSOCKET HANDLERS (ONCE) -------------------- */
  const handleIncomingMessage = useCallback((msg) => {
    // Try to get sender from message fields
    let senderId = msg.from || msg.senderId || msg.sender || msg.userId;
    
    // If backend doesn't include 'from', infer from 'to' field using chatsRef
    if (!senderId && msg.to) {
      const chat = chatsRef.current.find(c => c.participants?.includes(msg.to));
      if (chat?.peerId) {
        senderId = chat.peerId;
        console.log(`🔄 Inferred sender from peer: ${senderId}`);
      }
    }
    
    console.log(`📥 Received message from ${senderId}:`, msg.payload?.content);

    if (!senderId) {
      console.error("❌ Cannot determine sender ID from message:", msg);
      return;
    }

    const incoming = {
      id: crypto.randomUUID(),
      senderId: senderId,
      content: msg.payload?.content || msg.payload,
      timestamp: new Date(),
      status: "delivered"
    };

    setChats(prev =>
      prev.map(chat =>
        chat.peerId === senderId
          ? {
              ...chat,
              messages: [...chat.messages, incoming],
              lastMessage: incoming.content,
              lastTimestamp: new Date(),
              unreadCount: 0
            }
          : chat
      )
    );
  }, []);

  const handleOffer = useCallback(async (msg) => {
    console.log(`📞 Received OFFER from ${msg.from}`);
    setInCall(true);

    await createPeerConnection(
      (candidate) => {
        console.log("🧊 Sending ICE candidate");
        WebSocketService.send({
          type: "ICE",
          to: msg.from,
          candidate
        });
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      }
    );

    const stream = await getUserMedia(true, true);
    setLocalStream(stream);
    addTracks();

    const answer = await createAnswer(msg.offer);
    console.log("📤 Sending ANSWER");
    WebSocketService.send({
      type: "ANSWER",
      to: msg.from,
      answer
    });
  }, []);

  const handleAnswer = useCallback(async (msg) => {
    console.log(`✅ Received ANSWER from ${msg.from}`);
    await setRemoteAnswer(msg.answer);
  }, []);

  const handleIce = useCallback(async (msg) => {
    if (msg?.candidate) {
      console.log(`🧊 Received ICE candidate`);
      await addIceCandidate(msg.candidate);
    }
  }, []);

  useEffect(() => {
    if (!user || handlersRegisteredRef.current) return;

    console.log("📌 Registering WebSocket handlers");
    WebSocketService.on("MESSAGE", handleIncomingMessage);
    WebSocketService.on("OFFER", handleOffer);
    WebSocketService.on("ANSWER", handleAnswer);
    WebSocketService.on("ICE", handleIce);
    
    handlersRegisteredRef.current = true;

    return () => {
      console.log("🧹 Cleanup: handlers stay registered (singleton pattern)");
    };
  }, [user, handleIncomingMessage, handleOffer, handleAnswer, handleIce]);

  /* -------------------- MESSAGING -------------------- */
  const handleSendMessage = (text) => {
    if (!selectedChat || !user) return;

    const message = {
      id: crypto.randomUUID(),
      senderId: user.id,
      content: text,
      timestamp: new Date(),
      status: "sending",
      chatId: selectedChat.id
    };

    console.log(`📤 Sending to ${selectedChat.peerId}: "${text}"`);

    // Update UI immediately
    setChats(prev =>
      prev.map(chat =>
        chat.id === selectedChat.id
          ? {
              ...chat,
              messages: [...chat.messages, message],
              lastMessage: text,
              lastTimestamp: new Date()
            }
          : chat
      )
    );

    // Send via WebSocket
    WebSocketService.send({
      type: "MESSAGE",
      to: selectedChat.peerId,
      payload: {
        content: text,
        messageId: message.id
      }
    });

    // Update status to "sent"
    setTimeout(() => {
      setChats(prev =>
        prev.map(chat =>
          chat.id === selectedChat.id
            ? {
                ...chat,
                messages: chat.messages.map(msg =>
                  msg.id === message.id ? { ...msg, status: "sent" } : msg
                )
              }
            : chat
        )
      );
    }, 100);
  };

  /* -------------------- WEBRTC CALL INITIATOR -------------------- */
  const startCall = async (video = false) => {
    if (!selectedChat) return;
    
    console.log(`📞 Starting ${video ? 'video' : 'audio'} call`);
    setInCall(true);

    await createPeerConnection(
      (candidate) => {
        console.log("🧊 Sending ICE candidate");
        WebSocketService.send({
          type: "ICE",
          to: selectedChat.peerId,
          candidate
        });
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      }
    );

    const stream = await getUserMedia(true, video);
    setLocalStream(stream);
    addTracks();

    const offer = await createOffer();
    console.log("📤 Sending OFFER");
    WebSocketService.send({
      type: "OFFER",
      to: selectedChat.peerId,
      offer
    });
  };

  const endCall = () => {
    console.log("📴 Ending call");
    closeConnection();
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
  };

  /* -------------------- UI -------------------- */
  if (!user || !token) {
    return <div className="init-screen">Initializing secure session…</div>;
  }

  if (!peerUserId) {
    return (
      <div className="init-screen">
        <p>Waiting for peer connection...</p>
        <small>Open both tabs: ?user=alice and ?user=bob</small>
      </div>
    );
  }

  const addChat = () => {
    const peerName = prompt("Enter peer name:");
    if (!peerName) return;

    const peerId = prompt("Enter peer user ID:");
    if (!peerId) return;

    const newChat = {
      id: crypto.randomUUID(),
      peerId: peerId,
      participants: [user.id, peerId],
      name: peerName,
      online: true,
      messages: [],
      lastMessage: "",
      lastTimestamp: null,
      unreadCount: 0
    };

    setChats(prev => [...prev, newChat]);
    setSelectedChatId(newChat.id);
  };

  const handleCall = (type) => {
    if (type === "audio") {
      startCall(false);
    } else if (type === "video") {
      startCall(true);
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar-wrapper">
        <Sidebar
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={(chat) => setSelectedChatId(chat.id)}
          onAddChat={addChat}
          currentUser={user}
        />
      </div>

      <div className="chat-wrapper">
        <ChatWindow
          chat={selectedChat}
          messages={selectedChat?.messages || []}
          currentUser={user}
          onSendMessage={handleSendMessage}
          onCall={handleCall}
          inCall={inCall}
          startCall={startCall}
          endCall={endCall}
        />
      </div>

      {/* Video streams */}
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