// API Service for Spring Boot Backend Integration
// Base URL configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Generic request handler
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Add authentication token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Authentication endpoints
  async login(credentials) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(userData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  // User endpoints
  async getCurrentUser() {
    return this.request('/users/me');
  }

  async updateProfile(profileData) {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  async getUserContacts() {
    return this.request('/users/contacts');
  }

  // Chat endpoints
  async getChats() {
    return this.request('/chats');
  }

  async getChatMessages(chatId) {
    return this.request(`/chats/${chatId}/messages`);
  }

  async sendMessage(chatId, messageData) {
    return this.request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  async createChat(participantIds) {
    return this.request('/chats', {
      method: 'POST',
      body: JSON.stringify({ participants: participantIds }),
    });
  }

  // File upload
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    return fetch(`${this.baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
      body: formData,
    }).then(res => res.json());
  }
}

export default new ApiService();
