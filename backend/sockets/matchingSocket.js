const jwt = require('jsonwebtoken');
const RealTimeMatchingService = require('../services/RealTimeMatchingService');
const ConnectionService = require('../services/ConnectionService');
const NotificationService = require('../services/NotificationService');

function setupMatchingSocket(io) {
  // Initialize services
  const notificationService = new NotificationService(io);
  const connectionService = new ConnectionService(notificationService);
  const matchingService = new RealTimeMatchingService(io, connectionService, notificationService);

  // Authentication middleware for socket connections
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        console.log('❌ Socket connection rejected: No token provided');
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      console.log(`✅ Socket authenticated for user: ${socket.userId}`);
      next();
    } catch (err) {
      console.log('❌ Socket authentication failed:', err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User ${socket.userId} connected to matching service`);

    // Join user to their personal notification room
    notificationService.joinUserRoom(socket.userId, socket);

    // Handle new search request
    socket.on('start_search', async (searchData) => {
      try {
        console.log(`🔍 User ${socket.userId} starting search:`, searchData);
        await matchingService.handleNewSearch(searchData, socket.userId, socket);
      } catch (error) {
        console.error('Error starting search:', error);
        socket.emit('search_error', { message: 'Failed to start search: ' + error.message });
      }
    });

    // Handle match approval
    socket.on('approve_match', async (data) => {
      try {
        console.log(`✅ User ${socket.userId} approving match:`, data);
        const { matchId } = data;
        await matchingService.handleMatchApproval(matchId, socket.userId, socket);
      } catch (error) {
        console.error('Error approving match:', error);
        socket.emit('match_error', { message: 'Failed to approve match: ' + error.message });
      }
    });

    // Handle match denial
    socket.on('deny_match', async (data) => {
      try {
        console.log(`❌ User ${socket.userId} denying match:`, data);
        const { matchId } = data;
        await matchingService.handleMatchDenial(matchId, socket.userId, socket);
      } catch (error) {
        console.error('Error denying match:', error);
        socket.emit('match_error', { message: 'Failed to deny match: ' + error.message });
      }
    });

    // Handle chat messages
    socket.on('send_chat_message', async (data) => {
      try {
        const { chatRoomId, message } = data;
        if (!message || !message.trim()) {
          socket.emit('chat_error', { message: 'Message cannot be empty' });
          return;
        }
        
        console.log(`💬 Chat message from user ${socket.userId} in room ${chatRoomId}: ${message}`);
        await matchingService.handleChatMessage(chatRoomId, socket.userId, message, socket);
      } catch (error) {
        console.error('Error sending chat message:', error);
        socket.emit('chat_error', { message: 'Failed to send message: ' + error.message });
      }
    });

    // Handle join chat room (for reconnections)
    socket.on('join_chat_room', (data) => {
      const { chatRoomId } = data;
      socket.join(chatRoomId);
      console.log(`💬 User ${socket.userId} joined chat room ${chatRoomId}`);
    });

    // Handle stop search
    socket.on('stop_search', async () => {
      try {
        console.log(`🛑 User ${socket.userId} stopping search`);
        await matchingService.handleUserDisconnect(socket.userId);
        socket.emit('search_stopped', { message: 'Search stopped successfully' });
      } catch (error) {
        console.error('Error stopping search:', error);
        socket.emit('search_error', { message: 'Failed to stop search: ' + error.message });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { chatRoomId } = data;
      socket.to(chatRoomId).emit('user_typing', { 
        userId: socket.userId,
        typing: true 
      });
    });

    socket.on('typing_stop', (data) => {
      const { chatRoomId } = data;
      socket.to(chatRoomId).emit('user_typing', { 
        userId: socket.userId,
        typing: false 
      });
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 User ${socket.userId} disconnected from matching service. Reason: ${reason}`);
      
      try {
        // Clean up user's searches and matches
        await matchingService.handleUserDisconnect(socket.userId);
        
        // Leave notification room
        notificationService.leaveUserRoom(socket.userId, socket);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);
    });
  });

  console.log('🚀 Real-time matching socket service initialized');
}

module.exports = setupMatchingSocket;