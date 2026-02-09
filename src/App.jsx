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
  closeConnection,
  createDataChannel,
  setupDataChannelForReceiver,
  handleIncomingData,
  toggleMute,
  toggleCamera,
  switchCamera
} from "./services/webrtc";
import CallScreen from "./components/Callscreen .jsx";

function App() {
  const [dataReady, setDataReady] = useState(false);
  
  /* -------------------- USER -------------------- */
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  /* -------------------- DEMO PEER MAPPING -------------------- */
  const [peerUserId, setPeerUserId] = useState(null);
  const [peerName, setPeerName] = useState(null);

  /* -------------------- CHATS -------------------- */
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  
  const chatsRef = useRef([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const selectedChat = chats.find(c => c.id === selectedChatId) || chats[0];

  /* -------------------- WebRTC -------------------- */
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [dataOnlyMode, setDataOnlyMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [pendingIceCandidates, setPendingIceCandidates] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const wsConnectedRef = useRef(false);
  const handlersRegisteredRef = useRef(false);
  const peerConnectionRef = useRef(null);
  const currentPeerIdRef = useRef(null);
  const callDurationIntervalRef = useRef(null);

  /* -------------------- CALL DURATION TRACKING -------------------- */
  useEffect(() => {
    if (inCall && callStartTime) {
      callDurationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    } else {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = null;
      }
    }

    return () => {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
      }
    };
  }, [inCall, callStartTime]);

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

    console.log(`💬 Setting up chat: ${user.name} → ${peerName} (${peerUserId})`);

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

  /* -------------------- FILE RECEIVED -------------------- */
  const handleFileReceived = useCallback((file) => {
    console.log("📥 File received:", file.name);

    const fileMessage = {
      id: crypto.randomUUID(),
      senderId: peerUserId,
      type: "file",
      fileName: file.name,
      fileUrl: file.url,
      mime: file.mime,
      fileSize: file.size,
      timestamp: new Date(),
      status: "delivered"
    };

    setChats(prev =>
      prev.map(chat => {
        // Add to the chat with the peer who sent it
        if (chat.peerId === peerUserId) {
          return {
            ...chat,
            messages: [...chat.messages, fileMessage],
            lastMessage: `📎 ${file.name}`,
            lastTimestamp: new Date()
          };
        }
        return chat;
      })
    );
  }, [peerUserId]);

  /* -------------------- PROCESS PENDING ICE CANDIDATES -------------------- */
  const processPendingIceCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    
    if (!pc || !pc.remoteDescription || pendingIceCandidates.length === 0) {
      return;
    }

    console.log(`📦 Processing ${pendingIceCandidates.length} pending ICE candidates`);
    
    for (const candidate of pendingIceCandidates) {
      try {
        await addIceCandidate(candidate);
      } catch (error) {
        console.error("❌ Error adding pending ICE candidate:", error);
      }
    }
    
    setPendingIceCandidates([]);
  }, [pendingIceCandidates]);

  /* -------------------- WEBSOCKET HANDLERS -------------------- */
  const handleIncomingMessage = useCallback((msg) => {
    let senderId = msg.from || msg.senderId || msg.sender || msg.userId;
    
    if (!senderId && msg.to) {
      const chat = chatsRef.current.find(c => c.participants?.includes(msg.to));
      if (chat?.peerId) {
        senderId = chat.peerId;
      }
    }
    
    console.log(`📥 Received message from ${senderId}:`, msg.payload?.content);

    if (!senderId) {
      console.error("❌ Cannot determine sender ID");
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
              unreadCount: chat.id === selectedChatId ? 0 : chat.unreadCount + 1
            }
          : chat
      )
    );
  }, [selectedChatId]);

  const handleOffer = useCallback(async (msg) => {
    console.log(`📞 Received OFFER from ${msg.from}`);
    
    currentPeerIdRef.current = msg.from;
    const isDataOnly = msg.dataOnly === true;
    setDataOnlyMode(isDataOnly);
    
    if (!isDataOnly) {
      setInCall(true);
      setIsVideoCall(msg.isVideo || false);
      setCallStartTime(Date.now());
      setCallDuration(0);
    }

    const pc = await createPeerConnection(
      (candidate) => {
        WebSocketService.send({
          type: "ICE",
          to: msg.from,
          candidate
        });
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      },
      {
        onConnectionStateChange: (state) => {
          console.log(`Connection state: ${state}`);
        },
        onConnected: () => {
          console.log("✅ Connected");
          setIsReconnecting(false);
        },
        onDisconnected: () => {
          console.log("⚠️ Disconnected");
        },
        onReconnecting: (attempt) => {
          console.log(`🔄 Reconnecting (attempt ${attempt})`);
          setIsReconnecting(true);
        },
        onReconnectFailed: () => {
          console.log("❌ Reconnection failed");
          if (!isDataOnly) {
            alert("Connection lost. Call ended.");
            endCall();
          }
        }
      }
    );

    peerConnectionRef.current = pc;

    // Set remote description from the offer
    const remoteDesc = new RTCSessionDescription(msg.offer);
    await pc.setRemoteDescription(remoteDesc);
    
    // Process any pending ICE candidates
    await processPendingIceCandidates();

    // Get media if not data-only mode
    if (!isDataOnly) {
      const quality = connectionQuality === 'poor' ? 'low' : 'high';
      const stream = await getUserMedia(true, msg.isVideo, quality);
      setLocalStream(stream);
      addTracks();
    }

    // Setup data channel for receiver
    setupDataChannelForReceiver(
      (data) => handleIncomingData(data, handleFileReceived),
      () => {
        console.log("✅ DataChannel ready (receiver)");
        setDataReady(true);
      }
    );

    // Create answer
    const answerDesc = await pc.createAnswer();
    await pc.setLocalDescription(answerDesc);
    
    console.log("✅ Answer created successfully");
    
    // Send answer with both type and sdp
    WebSocketService.send({
      type: "ANSWER",
      to: msg.from,
      answer: {
        type: answerDesc.type,
        sdp: answerDesc.sdp
      },
      dataOnly: isDataOnly
    });
  }, [connectionQuality, handleFileReceived, processPendingIceCandidates]);

  const handleAnswer = useCallback(async (msg) => {
    console.log(`✅ Received ANSWER from ${msg.from}`);
    
    try {
      const pc = peerConnectionRef.current;
      
      if (!pc) {
        console.error("❌ No peer connection available");
        return;
      }
      
      // Create RTCSessionDescription from the answer object
      const remoteDesc = new RTCSessionDescription(msg.answer);
      await pc.setRemoteDescription(remoteDesc);
      
      console.log("✅ Remote answer set successfully");
      
      // Process any pending ICE candidates
      await processPendingIceCandidates();
      
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
    }
  }, [processPendingIceCandidates]);

  const handleIce = useCallback(async (msg) => {
    if (!msg?.candidate) return;
    
    console.log("🧊 Received ICE candidate");
    
    const pc = peerConnectionRef.current;
    
    if (!pc) {
      console.log('📦 Queueing ICE candidate (no peer connection yet)');
      setPendingIceCandidates(prev => [...prev, msg.candidate]);
      return;
    }
    
    try {
      // If no remote description yet, queue the candidate
      if (!pc.remoteDescription) {
        console.log('📦 Queueing ICE candidate (waiting for remote description)');
        setPendingIceCandidates(prev => [...prev, msg.candidate]);
        return;
      }

      // We have remote description, add the candidate immediately
      await addIceCandidate(msg.candidate);
      
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error);
      // If error, queue it for retry
      setPendingIceCandidates(prev => [...prev, msg.candidate]);
    }
  }, []);

  useEffect(() => {
    if (!user || handlersRegisteredRef.current) return;

    console.log("🔌 Registering WebSocket handlers");
    WebSocketService.on("MESSAGE", handleIncomingMessage);
    WebSocketService.on("OFFER", handleOffer);
    WebSocketService.on("ANSWER", handleAnswer);
    WebSocketService.on("ICE", handleIce);
    
    handlersRegisteredRef.current = true;
  }, [user, handleIncomingMessage, handleOffer, handleAnswer, handleIce]);

  /* -------------------- MESSAGING -------------------- */
  const handleSendMessage = (text, isFileMessage = false) => {
    if (!selectedChat || !user) return;

    let message;
    
    if (isFileMessage) {
      // text is actually a file message object
      message = {
        ...text,
        chatId: selectedChat.id
      };
    } else {
      // Regular text message
      message = {
        id: crypto.randomUUID(),
        senderId: user.id,
        content: text,
        timestamp: new Date(),
        status: "sending",
        chatId: selectedChat.id
      };
    }

    setChats(prev =>
      prev.map(chat =>
        chat.id === selectedChat.id
          ? {
              ...chat,
              messages: [...chat.messages, message],
              lastMessage: isFileMessage ? `📎 ${message.fileName}` : text,
              lastTimestamp: new Date()
            }
          : chat
      )
    );

    // Only send text messages via WebSocket (files go via WebRTC DataChannel)
    if (!isFileMessage) {
      WebSocketService.send({
        type: "MESSAGE",
        to: selectedChat.peerId,
        payload: {
          content: text,
          messageId: message.id
        }
      });

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
    } else {
      // Update file message status to sent after a short delay
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
      }, 500);
    }
  };

  /* -------------------- DATA-ONLY CONNECTION -------------------- */
  const initiateDataConnection = async () => {
    if (!selectedChat) return;
    
    console.log(`🔗 Starting data-only connection for file transfer`);
    currentPeerIdRef.current = selectedChat.peerId;
    setDataOnlyMode(true);

    const pc = await createPeerConnection(
      (candidate) => {
        WebSocketService.send({
          type: "ICE",
          to: selectedChat.peerId,
          candidate
        });
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      },
      {
        onConnectionStateChange: (state) => {
          console.log(`Connection state: ${state}`);
        },
        onConnected: () => {
          console.log("✅ Data connection established");
        },
        onFailed: () => {
          console.log("❌ Data connection failed");
          setDataReady(false);
        }
      }
    );

    peerConnectionRef.current = pc;

    // Create data channel for file transfer
    createDataChannel(
      (data) => handleIncomingData(data, handleFileReceived),
      () => {
        console.log("✅ DataChannel ready (caller)");
        setDataReady(true);
      }
    );
    
    const offerDesc = await pc.createOffer();
    await pc.setLocalDescription(offerDesc);
    
    // Send complete offer object with both type and sdp
    WebSocketService.send({
      type: "OFFER",
      to: selectedChat.peerId,
      offer: {
        type: offerDesc.type,
        sdp: offerDesc.sdp
      },
      dataOnly: true
    });
  };

  /* -------------------- WEBRTC CALL -------------------- */
  const startCall = async (video = false) => {
    if (!selectedChat) return;
    
    console.log(`📞 Starting ${video ? 'video' : 'audio'} call`);
    currentPeerIdRef.current = selectedChat.peerId;
    setInCall(true);
    setDataOnlyMode(false);
    setIsVideoCall(video);
    setCallStartTime(Date.now());
    setCallDuration(0);

    const pc = await createPeerConnection(
      (candidate) => {
        WebSocketService.send({
          type: "ICE",
          to: selectedChat.peerId,
          candidate
        });
      },
      (stream) => {
        console.log("📺 Received remote stream");
        setRemoteStream(stream);
      },
      {
        onConnectionStateChange: (state) => {
          console.log(`Connection state: ${state}`);
        },
        onConnected: () => {
          console.log("✅ Connected");
          setIsReconnecting(false);
        },
        onDisconnected: () => {
          console.log("⚠️ Disconnected");
        },
        onReconnecting: (attempt) => {
          console.log(`🔄 Reconnecting (attempt ${attempt})`);
          setIsReconnecting(true);
        },
        onReconnectFailed: () => {
          console.log("❌ Reconnection failed");
          alert("Connection lost. Call ended.");
          endCall();
        }
      }
    );

    peerConnectionRef.current = pc;

    const quality = connectionQuality === 'poor' ? 'low' : 'high';
    const stream = await getUserMedia(true, video, quality);
    setLocalStream(stream);
    addTracks();

    // Create data channel for file transfer
    createDataChannel(
      (data) => handleIncomingData(data, handleFileReceived),
      () => {
        console.log("✅ DataChannel ready (caller)");
        setDataReady(true);
      }
    );
    
    const offerDesc = await pc.createOffer();
    await pc.setLocalDescription(offerDesc);
    
    // Send complete offer object with both type and sdp
    WebSocketService.send({
      type: "OFFER",
      to: selectedChat.peerId,
      offer: {
        type: offerDesc.type,
        sdp: offerDesc.sdp
      },
      dataOnly: false,
      isVideo: video
    });
  };

  const endCall = () => {
    console.log("🔴 Ending call");
    closeConnection();
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
    setDataOnlyMode(false);
    setDataReady(false);
    setIsVideoCall(false);
    setCallStartTime(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsReconnecting(false);
    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }
  };

  /* -------------------- MEDIA CONTROLS -------------------- */
  const handleToggleMute = () => {
    const muted = toggleMute();
    setIsMuted(muted);
  };

  const handleToggleVideo = () => {
    const videoOff = toggleCamera();
    setIsVideoOff(videoOff);
  };

  const handleSwitchCamera = async () => {
    await switchCamera();
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

  const handleSelectChat = (chat) => {
    setSelectedChatId(chat.id);
    // Hide sidebar on mobile when chat is selected
    if (window.innerWidth <= 768) {
      setShowSidebar(false);
    }
  };

  const handleBackToChats = () => {
    setShowSidebar(true);
  };

  return (
    <div className="app-container">
      <div className={`sidebar-wrapper ${!showSidebar ? 'hidden' : ''}`}>
        <Sidebar
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
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
          dataReady={dataReady}
          endCall={endCall}
          onInitiateDataConnection={initiateDataConnection}
          onBack={handleBackToChats}
          showBackButton={!showSidebar}
        />
      </div>

      {/* Call Screen Overlay */}
      {inCall && !dataOnlyMode && (
        <CallScreen
          localStream={localStream}
          remoteStream={remoteStream}
          peerName={selectedChat?.name || "Unknown"}
          isVideoCall={isVideoCall}
          onEndCall={endCall}
          onToggleMute={handleToggleMute}
          onToggleVideo={handleToggleVideo}
          onSwitchCamera={handleSwitchCamera}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          callDuration={callDuration}
          connectionQuality={connectionQuality}
          isReconnecting={isReconnecting}
        />
      )}
    </div>
  );
}

export default App;