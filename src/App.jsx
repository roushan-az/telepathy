import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import ApiService from './services/api';
import WebSocketService from './services/websocket';
import './App.css';

function App() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Mock user for UI demonstration
      const mockUser = {
        id: '1',
        name: 'John Doe',
        phone: '+1 234 567 8900',
        avatar: null,
        status: 'Hey there! I am using Premium Chat'
      };
      
      setCurrentUser(mockUser);

      // Mock chats data
      const mockChats = [
        {
          id: '1',
          name: 'Alice Cooper',
          avatar: null,
          lastMessage: 'Hey! How are you doing?',
          timestamp: new Date(Date.now() - 1000 * 60 * 5),
          unreadCount: 2,
          online: true
        },
        {
          id: '2',
          name: 'Bob Smith',
          avatar: null,
          lastMessage: 'Thanks for the update!',
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
          unreadCount: 0,
          online: false
        },
        {
          id: '3',
          name: 'Developer Team',
          avatar: null,
          lastMessage: 'Sprint planning tomorrow',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          unreadCount: 5,
          online: true
        },
        {
          id: '4',
          name: 'Sarah Johnson',
          avatar: null,
          lastMessage: 'See you later!',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
          unreadCount: 0,
          online: false
        }
      ];

      setChats(mockChats);

      // Initialize WebSocket connection (will fail gracefully without backend)
      try {
        WebSocketService.connect(mockUser.id);
        
        WebSocketService.on('message', (message) => {
          handleNewMessage(message);
        });
      } catch (error) {
        console.log('WebSocket connection pending backend setup');
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setIsLoading(false);
    }
  };

  const handleNewMessage = (message) => {
    if (selectedChat && message.chatId === selectedChat.id) {
      setMessages(prev => [...prev, message]);
    }
    
    // Update chat preview
    setChats(prev => prev.map(chat => 
      chat.id === message.chatId 
        ? { ...chat, lastMessage: message.content, timestamp: new Date(message.timestamp) }
        : chat
    ));
  };

  const handleChatSelect = (chat) => {
    setSelectedChat(chat);
    
    // Mock messages for selected chat
    const mockMessages = [
      {
        id: '1',
        senderId: chat.id,
        content: 'Hello! How are you?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        status: 'read'
      },
      {
        id: '2',
        senderId: currentUser.id,
        content: 'Hi! I\'m doing great, thanks for asking!',
        timestamp: new Date(Date.now() - 1000 * 60 * 55),
        status: 'read'
      },
      {
        id: '3',
        senderId: chat.id,
        content: 'That\'s wonderful to hear!',
        timestamp: new Date(Date.now() - 1000 * 60 * 50),
        status: 'read'
      },
      {
        id: '4',
        senderId: currentUser.id,
        content: 'How about you? What have you been up to?',
        timestamp: new Date(Date.now() - 1000 * 60 * 45),
        status: 'read'
      },
      {
        id: '5',
        senderId: chat.id,
        content: chat.lastMessage,
        timestamp: chat.timestamp,
        status: 'delivered'
      }
    ];
    
    setMessages(mockMessages);
  };

  const handleSendMessage = async (content) => {
    if (!selectedChat || !content.trim()) return;

    const newMessage = {
      id: Date.now().toString(),
      senderId: currentUser.id,
      chatId: selectedChat.id,
      content: content.trim(),
      timestamp: new Date(),
      status: 'sending'
    };

    // Optimistically add message
    setMessages(prev => [...prev, newMessage]);

    try {
      // Send via WebSocket (will queue when backend is ready)
      WebSocketService.sendMessage({
        chatId: selectedChat.id,
        content: content.trim()
      });

      // Update message status
      setMessages(prev => prev.map(msg => 
        msg.id === newMessage.id ? { ...msg, status: 'sent' } : msg
      ));
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === newMessage.id ? { ...msg, status: 'failed' } : msg
      ));
    }
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading Premium Chat...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar 
        chats={chats}
        selectedChat={selectedChat}
        onChatSelect={handleChatSelect}
        currentUser={currentUser}
      />
      <ChatWindow 
        chat={selectedChat}
        messages={messages}
        currentUser={currentUser}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

export default App;
