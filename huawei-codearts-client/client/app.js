document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    const statusElement = document.querySelector('.status');
    
    // Connect to Socket.IO server
    const socket = io('http://localhost:3001');
    
    // Connection status
    socket.on('connect', () => {
        statusElement.textContent = 'Connected';
        statusElement.style.color = '#4caf50';
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        statusElement.textContent = 'Disconnected';
        statusElement.style.color = '#f44336';
        console.log('Disconnected from server');
    });
    
    // Handle incoming messages
    socket.on('message', (data) => {
        addMessage(data.sender, data.text, data.timestamp);
    });
    
    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        addMessage('system', error.message || 'An error occurred');
    });
    
    // Handle form submission
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        
        if (message) {
            // Add user message to chat
            addMessage('user', message);
            
            // Emit message to server
            socket.emit('sendMessage', message, (response) => {
                if (response.status === 'Error') {
                    console.error('Error sending message:', response.error);
                }
            });
            
            // Clear input
            messageInput.value = '';
            messageInput.focus();
        }
    });
    
    // Add a new message to the chat
    function addMessage(sender, text, timestamp = new Date().toISOString()) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        
        const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="message-content">${text}</div>
            <div class="message-time">${time}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Show typing indicator
    function showTypingIndicator() {
        const typingElement = document.createElement('div');
        typingElement.classList.add('typing-indicator');
        typingElement.id = 'typing';
        typingElement.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;
        chatMessages.appendChild(typingElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Hide typing indicator
    function hideTypingIndicator() {
        const typingElement = document.getElementById('typing');
        if (typingElement) {
            typingElement.remove();
        }
    }
    
    // Handle typing events (optional)
    messageInput.addEventListener('input', () => {
        // You can implement typing indicators here if needed
    });
    
    // Initial focus on input
    messageInput.focus();
});
