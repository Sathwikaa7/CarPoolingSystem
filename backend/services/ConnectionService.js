const Connection = require('../models/Connection');
const Ride = require('../models/Ride');
const User = require('../models/User');

class ConnectionService {
  constructor(notificationService = null) {
    this.notificationService = notificationService;
  }
  /**
   * Create a new connection request
   * @param {Object} requestData - Connection request data
   * @param {string} requestData.requesterId - ID of the user making the request
   * @param {string} requestData.rideId - ID of the ride to connect to
   * @param {string} requestData.message - Optional message from requester
   * @param {Object} requestData.pickupLocation - Requester's pickup location
   * @param {string} requestData.pickupLocation.address - Pickup address
   * @param {Object} requestData.pickupLocation.coords - Pickup coordinates {lat, lng}
   * @returns {Promise<Object>} Created connection request
   */
  async createConnectionRequest(requestData) {
    try {
      const { requesterId, rideId, message, pickupLocation } = requestData;

      // Validate the ride exists and is active
      const ride = await Ride.findById(rideId)
        .populate('user', 'name email')
        .lean();

      if (!ride) {
        throw new Error('Ride not found');
      }

      if (!ride.isActive) {
        throw new Error('Ride is no longer active');
      }

      if (ride.availableSeats <= 0) {
        throw new Error('No available seats in this ride');
      }

      if (ride.user._id.toString() === requesterId) {
        throw new Error('Cannot request connection to your own ride');
      }

      // Check if there's already a pending request
      const existingRequest = await Connection.findOne({
        requester: requesterId,
        ride: rideId,
        status: 'pending'
      });

      if (existingRequest) {
        throw new Error('You already have a pending request for this ride');
      }

      // Create the connection request
      const connectionRequest = new Connection({
        requester: requesterId,
        rideOwner: ride.user._id,
        ride: rideId,
        message: message || '',
        requesterPickupLocation: pickupLocation,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });

      await connectionRequest.save();

      // Populate the request with user details for response
      const populatedRequest = await Connection.findById(connectionRequest._id)
        .populate([
          { path: 'requester', select: 'name email contactInfo' },
          { path: 'rideOwner', select: 'name email contactInfo' },
          { path: 'ride', select: 'pickup drop pickupCoords dropCoords dateTime type availableSeats' }
        ])
        .lean();

      // Send real-time notification to ride owner
      if (this.notificationService) {
        this.notificationService.notifyConnectionRequest(populatedRequest);
      }

      return populatedRequest;

    } catch (error) {
      console.error('Error creating connection request:', error);
      throw error;
    }
  }

  /**
   * Respond to a connection request (accept or decline)
   * @param {string} connectionId - ID of the connection request
   * @param {string} rideOwnerId - ID of the ride owner responding
   * @param {string} response - 'accepted' or 'declined'
   * @returns {Promise<Object>} Updated connection request
   */
  async respondToConnectionRequest(connectionId, rideOwnerId, response) {
    try {
      if (!['accepted', 'declined'].includes(response)) {
        throw new Error('Invalid response. Must be "accepted" or "declined"');
      }

      // Find the connection request
      const connection = await Connection.findById(connectionId)
        .populate([
          { path: 'requester', select: 'name email contactInfo' },
          { path: 'rideOwner', select: 'name email contactInfo' },
          { path: 'ride' }
        ]);

      if (!connection) {
        throw new Error('Connection request not found');
      }

      if (connection.rideOwner._id.toString() !== rideOwnerId) {
        throw new Error('You are not authorized to respond to this request');
      }

      if (connection.status !== 'pending') {
        throw new Error('This request has already been responded to or expired');
      }

      if (new Date() > connection.expiresAt) {
        // Auto-expire the request
        connection.status = 'expired';
        await connection.save();
        throw new Error('This request has expired');
      }

      // Update the connection status
      connection.status = response;
      connection.respondedAt = new Date();
      await connection.save();

      // Send real-time notification to requester
      if (this.notificationService) {
        this.notificationService.notifyConnectionResponse(connection, response);
      }

      // If accepted, update the ride's available seats and connected users
      if (response === 'accepted') {
        const ride = connection.ride;
        
        if (ride.availableSeats <= 0) {
          throw new Error('No available seats remaining');
        }

        ride.availableSeats -= 1;
        ride.connectedUsers.push(connection.requester._id);
        await ride.save();

        // Auto-decline other pending requests for this ride if no seats left
        if (ride.availableSeats === 0) {
          await this.autoDeclinePendingRequests(ride._id, connectionId);
        }
      }

      return connection.toObject();

    } catch (error) {
      console.error('Error responding to connection request:', error);
      throw error;
    }
  }

  /**
   * Get connection requests for a ride owner
   * @param {string} rideOwnerId - ID of the ride owner
   * @param {string} status - Optional status filter ('pending', 'accepted', 'declined', 'expired')
   * @returns {Promise<Array>} Array of connection requests
   */
  async getConnectionRequestsForOwner(rideOwnerId, status = null) {
    try {
      const query = { rideOwner: rideOwnerId };
      if (status) {
        query.status = status;
      }

      const requests = await Connection.find(query)
        .populate([
          { path: 'requester', select: 'name email contactInfo' },
          { path: 'ride', select: 'pickup drop pickupCoords dropCoords dateTime type availableSeats' }
        ])
        .sort({ createdAt: -1 })
        .lean();

      // Auto-expire any pending requests that have passed their expiry time
      await this.expirePendingRequests();

      return requests;

    } catch (error) {
      console.error('Error fetching connection requests for owner:', error);
      throw error;
    }
  }

  /**
   * Get connection requests made by a user
   * @param {string} requesterId - ID of the requester
   * @param {string} status - Optional status filter
   * @returns {Promise<Array>} Array of connection requests
   */
  async getConnectionRequestsByRequester(requesterId, status = null) {
    try {
      const query = { requester: requesterId };
      if (status) {
        query.status = status;
      }

      const requests = await Connection.find(query)
        .populate([
          { path: 'rideOwner', select: 'name email contactInfo' },
          { path: 'ride', select: 'pickup drop pickupCoords dropCoords dateTime type availableSeats' }
        ])
        .sort({ createdAt: -1 })
        .lean();

      // Auto-expire any pending requests that have passed their expiry time
      await this.expirePendingRequests();

      return requests;

    } catch (error) {
      console.error('Error fetching connection requests by requester:', error);
      throw error;
    }
  }

  /**
   * Get accepted connections for a user (both as requester and ride owner)
   * @param {string} userId - ID of the user
   * @returns {Promise<Object>} Object with asRequester and asRideOwner arrays
   */
  async getAcceptedConnections(userId) {
    try {
      const [asRequester, asRideOwner] = await Promise.all([
        Connection.find({ 
          requester: userId, 
          status: 'accepted' 
        })
        .populate([
          { path: 'rideOwner', select: 'name email contactInfo' },
          { path: 'ride', select: 'pickup drop pickupCoords dropCoords dateTime type' }
        ])
        .sort({ respondedAt: -1 })
        .lean(),

        Connection.find({ 
          rideOwner: userId, 
          status: 'accepted' 
        })
        .populate([
          { path: 'requester', select: 'name email contactInfo' },
          { path: 'ride', select: 'pickup drop pickupCoords dropCoords dateTime type' }
        ])
        .sort({ respondedAt: -1 })
        .lean()
      ]);

      return {
        asRequester,
        asRideOwner
      };

    } catch (error) {
      console.error('Error fetching accepted connections:', error);
      throw error;
    }
  }

  /**
   * Cancel a pending connection request
   * @param {string} connectionId - ID of the connection request
   * @param {string} requesterId - ID of the requester
   * @returns {Promise<Object>} Updated connection request
   */
  async cancelConnectionRequest(connectionId, requesterId) {
    try {
      const connection = await Connection.findById(connectionId);

      if (!connection) {
        throw new Error('Connection request not found');
      }

      if (connection.requester.toString() !== requesterId) {
        throw new Error('You are not authorized to cancel this request');
      }

      if (connection.status !== 'pending') {
        throw new Error('Only pending requests can be cancelled');
      }

      connection.status = 'declined'; // Mark as declined to indicate cancellation
      connection.respondedAt = new Date();
      await connection.save();

      return connection.toObject();

    } catch (error) {
      console.error('Error cancelling connection request:', error);
      throw error;
    }
  }

  /**
   * Auto-decline pending requests for a ride when it becomes full
   * @param {string} rideId - ID of the ride
   * @param {string} excludeConnectionId - Connection ID to exclude from auto-decline
   */
  async autoDeclinePendingRequests(rideId, excludeConnectionId = null) {
    try {
      const query = {
        ride: rideId,
        status: 'pending'
      };

      if (excludeConnectionId) {
        query._id = { $ne: excludeConnectionId };
      }

      await Connection.updateMany(
        query,
        {
          status: 'declined',
          respondedAt: new Date()
        }
      );

    } catch (error) {
      console.error('Error auto-declining pending requests:', error);
    }
  }

  /**
   * Expire pending requests that have passed their expiry time
   */
  async expirePendingRequests() {
    try {
      await Connection.updateMany(
        {
          status: 'pending',
          expiresAt: { $lt: new Date() }
        },
        {
          status: 'expired',
          respondedAt: new Date()
        }
      );

    } catch (error) {
      console.error('Error expiring pending requests:', error);
    }
  }

  /**
   * Get connection statistics for a user
   * @param {string} userId - ID of the user
   * @returns {Promise<Object>} Connection statistics
   */
  async getConnectionStats(userId) {
    try {
      const [sentRequests, receivedRequests] = await Promise.all([
        Connection.aggregate([
          { $match: { requester: userId } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Connection.aggregate([
          { $match: { rideOwner: userId } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);

      const formatStats = (stats) => {
        const result = { pending: 0, accepted: 0, declined: 0, expired: 0 };
        stats.forEach(stat => {
          result[stat._id] = stat.count;
        });
        return result;
      };

      return {
        sent: formatStats(sentRequests),
        received: formatStats(receivedRequests)
      };

    } catch (error) {
      console.error('Error fetching connection stats:', error);
      throw error;
    }
  }
}

module.exports = ConnectionService;