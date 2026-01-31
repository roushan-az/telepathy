import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import './ChatWindow.css';

function ChatWindow({ chat, messages, currentUser, onSendMessage }) {
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = () => {
    if (messageInput.trim()) {
      onSendMessage(messageInput);
      setMessageInput('');
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderMessageStatus = (status) => {
    switch (status) {
      case 'sending':
        return <Clock size={14} className="status-icon sending" />;
      case 'sent':
        return <Check size={14} className="status-icon sent" />;
      case 'delivered':
        return <CheckCheck size={14} className="status-icon delivered" />;
      case 'read':
        return <CheckCheck size={14} className="status-icon read" />;
      case 'failed':
        return <span className="status-icon failed">!</span>;
      default:
        return null;
    }
  };

  if (!chat) {
    return (
      <div className="chat-window empty">
        <div className="empty-chat-state">
          <div className="empty-icon">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
              <path d="M25 35C25 30 28 25 35 25H45C52 25 55 30 55 35V45C55 50 52 55 45 55H35C28 55 25 50 25 45V35Z" 
                    stroke="currentColor" strokeWidth="2" opacity="0.4"/>
              <circle cx="33" cy="38" r="2" fill="currentColor" opacity="0.4"/>
              <circle cx="40" cy="38" r="2" fill="currentColor" opacity="0.4"/>
              <circle cx="47" cy="38" r="2" fill="currentColor" opacity="0.4"/>
            </svg>
          </div>
          <h2>Premium Chat</h2>
          <p>Select a conversation to start messaging</p>
          <div className="feature-badges">
            <span className="feature-badge">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L2 3V6C2 8.5 3.5 10.5 6 11C8.5 10.5 10 8.5 10 6V3L6 1Z" fill="currentColor"/>
              </svg>
              End-to-end encrypted
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <div className={`avatar ${chat.online ? 'online-indicator' : ''}`}>
            {getInitials(chat.name)}
          </div>
          <div className="chat-header-details">
            <h2>{chat.name}</h2>
            <p className="chat-status">
              {isTyping ? 'typing...' : chat.online ? 'online' : 'offline'}
            </p>
          </div>
        </div>
        <div className="chat-header-actions">
          <button className="icon-button" title="Voice Call">
            <Phone size={20} />
          </button>
          <button className="icon-button" title="Video Call">
            <Video size={20} />
          </button>
          <button className="icon-button" title="More">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        <div className="encryption-banner">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L2 3.5V7C2 10 4 12.5 7 13C10 12.5 12 10 12 7V3.5L7 1Z" fill="currentColor"/>
          </svg>
          Messages are end-to-end encrypted. No one outside of this chat can read them.
        </div>

        {messages.map((message, index) => {
          const isOwn = message.senderId === currentUser.id;
          const showAvatar = !isOwn && (index === 0 || messages[index - 1].senderId !== message.senderId);

          return (
            <div key={message.id} className={`message ${isOwn ? 'own' : 'other'}`}>
              {!isOwn && showAvatar && (
                <div className="message-avatar avatar small">
                  {getInitials(chat.name)}
                </div>
              )}
              {!isOwn && !showAvatar && <div className="message-avatar-spacer"></div>}
              
              <div className="message-bubble">
                <p className="message-content">{message.content}</p>
                <div className="message-meta">
                  <span className="message-time">{formatMessageTime(message.timestamp)}</span>
                  {isOwn && renderMessageStatus(message.status)}
                </div>
              </div>
            </div>
          );
        })}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-container">
        <button className="icon-button" title="Attach">
          <Paperclip size={20} />
        </button>
        
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            rows={1}
            className="message-input"
          />
        </div>

        <button className="icon-button" title="Emoji">
          <Smile size={20} />
        </button>

        <button 
          className={`send-button ${messageInput.trim() ? 'active' : ''}`}
          onClick={handleSend}
          disabled={!messageInput.trim()}
          title="Send"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;
