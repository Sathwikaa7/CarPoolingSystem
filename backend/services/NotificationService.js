class NotificationService {
  constructor(io) {
    this.io = io;
  }

  /**
   * Send connection request notification to ride owner
   * @param {Object} connectionRequest - The connection request object
   */
  notifyConnectionRequest(connectionRequest) {
    if (!this.io) return;

    const rideOwnerId = connectionRequest.rideOwner._id || connectionRequest.rideOwner;
    
    this.io.to(`user_${rideOwnerId}`).emit('connection_request', {
      type: 'connection_request',
      data: connectionRequest,
      message: `New connection request from ${connectionRequest.requester?.name || 'a user'}`
    });
  }

  /**
   * Send connection response notification to requester
   * @param {Object} connectionRequest - The connection request object
   * @param {string} response - 'accepted' or 'declined'
   */
  notifyConnectionResponse(connectionRequest, response) {
    if (!this.io) return;

    const requesterId = connectionRequest.requester._id || connectionRequest.requester;
    const rideOwnerName = connectionRequest.rideOwner?.name || 'Ride owner';
    
    this.io.to(`user_${requesterId}`).emit('connection_response', {
      type: 'connection_response',
      data: connectionRequest,
      response,
      message: response === 'accepted' 
        ? `${rideOwnerName} accepted your connection request!`
        : `${rideOwnerName} declined your connection request.`
    });
  }

  /**
   * Send connection expiry notification
   * @param {Object} connectionRequest - The expired connection request
   */
  notifyConnectionExpired(connectionRequest) {
    if (!this.io) return;

    const requesterId = connectionRequest.requester._id || connectionRequest.requester;
    
    this.io.to(`user_${requesterId}`).emit('connection_expired', {
      type: 'connection_expired',
      data: connectionRequest,
      message: 'Your connection request has expired'
    });
  }

  /**
   * Send ride update notification (when seats become unavailable)
   * @param {Object} ride - The ride object
   * @param {Array} affectedUsers - Array of user IDs to notify
   */
  notifyRideUpdate(ride, affectedUsers) {
    if (!this.io || !affectedUsers?.length) return;

    affectedUsers.forEach(userId => {
      this.io.to(`user_${userId}`).emit('ride_update', {
        type: 'ride_update',
        data: ride,
        message: 'Ride information has been updated'
      });
    });
  }

  /**
   * Send general notification to a user
   * @param {string} userId - User ID to notify
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   * @param {string} message - Notification message
   */
  notifyUser(userId, type, data, message) {
    if (!this.io) return;

    this.io.to(`user_${userId}`).emit('notification', {
      type,
      data,
      message,
      timestamp: new Date()
    });
  }

  /**
   * Join user to their personal room for notifications
   * @param {string} userId - User ID
   * @param {Object} socket - Socket object
   */
  joinUserRoom(userId, socket) {
    if (!socket) return;
    
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined notification room`);
  }

  /**
   * Leave user's personal room
   * @param {string} userId - User ID
   * @param {Object} socket - Socket object
   */
  leaveUserRoom(userId, socket) {
    if (!socket) return;
    
    socket.leave(`user_${userId}`);
    console.log(`User ${userId} left notification room`);
  }
}

module.exports = NotificationService;