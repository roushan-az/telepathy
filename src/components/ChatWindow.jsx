import { useState, useRef, useEffect } from "react";
import {
  Phone,
  Video,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Clock
} from "lucide-react";
import "./ChatWindow.css";

function ChatWindow({ chat, messages = [], currentUser, onSendMessage, onCall }) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  /* -------------------- Debug -------------------- */
  useEffect(() => {
    console.log("💬 ChatWindow - messages count:", messages.length);
    console.log("💬 ChatWindow - messages:", messages);
    console.log("💬 ChatWindow - currentUser:", currentUser);
  }, [messages, currentUser]);

  /* -------------------- Auto scroll -------------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* -------------------- Send message -------------------- */
  const handleSend = () => {
    if (!messageInput.trim()) return;
    onSendMessage(messageInput.trim());
    setMessageInput("");
    inputRef.current?.focus();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* -------------------- Helpers -------------------- */
  const formatMessageTime = (date) =>
    new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

  const getInitials = (name = "") =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const renderStatus = (status) => {
    switch (status) {
      case "sending":
        return <Clock size={14} />;
      case "sent":
        return <Check size={14} />;
      case "delivered":
      case "read":
        return <CheckCheck size={14} />;
      default:
        return null;
    }
  };

  /* -------------------- Empty state -------------------- */
  if (!chat) {
    return (
      <div className="chat-window empty">
        <div className="empty-chat-state">
          <h2>Premium Chat</h2>
          <p>Select a conversation to start messaging</p>
          <span className="feature-badge">🔒 End-to-end encrypted</span>
        </div>
      </div>
    );
  }

  /* -------------------- UI -------------------- */
  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <div className={`avatar ${chat.online ? "online-indicator" : ""}`}>
            {getInitials(chat.name)}
          </div>
          <div>
            <h2>{chat.name}</h2>
            <p className="chat-status">
              {chat.online ? "online" : "offline"}
            </p>
          </div>
        </div>

        <div className="chat-header-actions">
          <button className="icon-button" title="Voice call" onClick={() => onCall?.("audio")}>
            <Phone size={18} />
          </button>
          <button className="icon-button" title="Video call"  onClick={() => onCall?.("video")}>
            <Video size={18} />
          </button>
          <button className="icon-button">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        <div className="encryption-banner">
          🔒 Messages are end-to-end encrypted
        </div>

        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            No messages yet. Start the conversation!
          </div>
        )}

        {messages.map((msg, index) => {
          const isOwn = msg.senderId === currentUser?.id;
          console.log(`💬 Rendering message ${index}: senderId=${msg.senderId}, currentUserId=${currentUser?.id}, isOwn=${isOwn}, content="${msg.content}"`);

          return (
            <div
              key={msg.id || index}
              className={`message ${isOwn ? "own" : "other"}`}
            >
              <div className="message-bubble">
                <p>{msg.content}</p>
                <div className="message-meta">
                  <span>{formatMessageTime(msg.timestamp)}</span>
                  {isOwn && renderStatus(msg.status)}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-container">
        <button className="icon-button">
          <Paperclip size={18} />
        </button>

        <textarea
          ref={inputRef}
          className="message-input"
          placeholder="Type a message…"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={handleKeyPress}
          rows={1}
        />

        <button className="icon-button">
          <Smile size={18} />
        </button>

        <button
          className={`send-button ${messageInput.trim() ? "active" : ""}`}
          onClick={handleSend}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;