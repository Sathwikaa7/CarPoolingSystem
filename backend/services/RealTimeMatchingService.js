const ActiveSearch = require('../models/ActiveSearch');
const Connection = require('../models/Connection');
const User = require('../models/User');

class RealTimeMatchingService {
  constructor(io, connectionService, notificationService) {
    this.io = io;
    this.connectionService = connectionService;
    this.notificationService = notificationService;
    this.activeMatches = new Map(); // Store active matching sessions
    this.matchingInterval = null;
    this.startContinuousMatching();
  }

  /**
   * Start continuous matching process
   */
  startContinuousMatching() {
    // Check for new matches every 5 seconds
    this.matchingInterval = setInterval(async () => {
      try {
        await this.performContinuousMatching();
      } catch (error) {
        console.error('Error in continuous matching:', error);
      }
    }, 5000);

    console.log('🔄 Continuous matching started (checking every 5 seconds)');
  }

  /**
   * Perform continuous matching for all active searches
   */
  async performContinuousMatching() {
    try {
      const activeSearches = await ActiveSearch.find({})
        .populate('user', 'name email contactInfo');

      if (activeSearches.length === 0) {
        // console.log('🔄 No active searches found');
        return;
      }

      if (activeSearches.length < 2) {
        console.log(`🔄 Only ${activeSearches.length} active search(es), need at least 2 for matching`);
        return;
      }

      console.log(`🔄 Checking ${activeSearches.length} active searches for matches...`);

      // Group by type
      const findCarSearches = activeSearches.filter(s => s.type === 'findCar');
      const poolCarSearches = activeSearches.filter(s => s.type === 'poolCar');

      console.log(`🔍 FindCar searches: ${findCarSearches.length}, PoolCar searches: ${poolCarSearches.length}`);

      // Try to match findCar with poolCar
      for (const findCarSearch of findCarSearches) {
        // Skip if user already has a pending match
        if (this.userHasPendingMatch(findCarSearch.user._id)) {
          console.log(`⏭️ User ${findCarSearch.user._id} already has pending match, skipping`);
          continue;
        }

        for (const poolCarSearch of poolCarSearches) {
          // Skip if user already has a pending match
          if (this.userHasPendingMatch(poolCarSearch.user._id)) {
            console.log(`⏭️ User ${poolCarSearch.user._id} already has pending match, skipping`);
            continue;
          }

          // Check if they're compatible
          if (this.areSearchesCompatible(findCarSearch, poolCarSearch)) {
            console.log(`🎯 Compatible match found: ${findCarSearch.user.name} (${findCarSearch.user._id}) ↔ ${poolCarSearch.user.name} (${poolCarSearch.user._id})`);
            await this.initiateInstantConnection(findCarSearch, poolCarSearch);
            break; // Move to next findCar search
          }
        }
      }
    } catch (error) {
      console.error('Error in continuous matching:', error);
    }
  }

  /**
   * Check if user has a pending match
   */
  userHasPendingMatch(userId) {
    const userIdStr = userId.toString();
    for (const match of this.activeMatches.values()) {
      const user1Str = match.user1.toString();
      const user2Str = match.user2.toString();
      if ((user1Str === userIdStr || user2Str === userIdStr) && 
          match.status === 'pending_approval') {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if two searches are compatible
   */
  areSearchesCompatible(search1, search2) {
    const pickupDistance = this.calculateDistance(
      search1.pickupCoords.coordinates[1], search1.pickupCoords.coordinates[0],
      search2.pickupCoords.coordinates[1], search2.pickupCoords.coordinates[0]
    );

    const dropDistance = this.calculateDistance(
      search1.dropCoords.coordinates[1], search1.dropCoords.coordinates[0],
      search2.dropCoords.coordinates[1], search2.dropCoords.coordinates[0]
    );

    const isCompatible = pickupDistance <= 5000 && dropDistance <= 5000;
    
    console.log(`🔍 Compatibility check: ${search1.user.name} vs ${search2.user.name}`);
    console.log(`   Pickup distance: ${Math.round(pickupDistance)}m (limit: 5000m)`);
    console.log(`   Drop distance: ${Math.round(dropDistance)}m (limit: 5000m)`);
    console.log(`   Compatible: ${isCompatible}`);

    return isCompatible;
  }

  /**
   * Handle new search and find instant matches
   * @param {Object} searchData - Search criteria
   * @param {string} userId - User ID
   * @param {Object} socket - User's socket connection
   */
  async handleNewSearch(searchData, userId, socket) {
    try {
      const { pickup, drop, pickupCoords, dropCoords, type } = searchData;

      // Remove any existing search for this user
      await ActiveSearch.deleteMany({ user: userId });

      // Create new active search
      const activeSearch = await ActiveSearch.create({
        user: userId,
        pickup,
        drop,
        pickupCoords: {
          type: 'Point',
          coordinates: [pickupCoords.lng, pickupCoords.lat]
        },
        dropCoords: {
          type: 'Point',
          coordinates: [dropCoords.lng, dropCoords.lat]
        },
        type
      });

      // Join user to their search room
      socket.join(`search_${userId}`);

      // Emit search started confirmation
      socket.emit('search_started', {
        message: `Searching for matches...`,
        searchId: activeSearch._id,
        searchType: type,
        route: `${pickup} → ${drop}`
      });

      // Look for instant matches
      const matches = await this.findInstantMatches(activeSearch);

      if (matches.length > 0) {
        // Process the first match (best match)
        await this.initiateInstantConnection(activeSearch, matches[0]);
      }

      return activeSearch;

    } catch (error) {
      console.error('Error handling new search:', error);
      throw error;
    }
  }

  /**
   * Find instant matches for a search
   * @param {Object} activeSearch - The active search object
   * @returns {Promise<Array>} Array of matching searches
   */
  async findInstantMatches(activeSearch) {
    try {
      const oppositeType = activeSearch.type === 'findCar' ? 'poolCar' : 'findCar';
      
      // Find searches within 5km radius that are looking for opposite type
      const matches = await ActiveSearch.find({
        user: { $ne: activeSearch.user },
        type: oppositeType,
        pickupCoords: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [activeSearch.pickupCoords.coordinates[0], activeSearch.pickupCoords.coordinates[1]]
            },
            $maxDistance: 5000 // 5km
          }
        }
      }).populate('user', 'name email contactInfo');

      // Filter by destination proximity (within 5km)
      const compatibleMatches = matches.filter(match => {
        const pickupDistance = this.calculateDistance(
          activeSearch.pickupCoords.coordinates[1], activeSearch.pickupCoords.coordinates[0],
          match.pickupCoords.coordinates[1], match.pickupCoords.coordinates[0]
        );

        const dropDistance = this.calculateDistance(
          activeSearch.dropCoords.coordinates[1], activeSearch.dropCoords.coordinates[0],
          match.dropCoords.coordinates[1], match.dropCoords.coordinates[0]
        );

        // Compatible if pickup within 5km and drop within 5km
        return pickupDistance <= 5000 && dropDistance <= 5000;
      });

      return compatibleMatches;

    } catch (error) {
      console.error('Error finding instant matches:', error);
      return [];
    }
  }

  /**
   * Initiate instant connection between two users
   * @param {Object} search1 - First user's search
   * @param {Object} search2 - Second user's search (match)
   */
  async initiateInstantConnection(search1, search2) {
    try {
      const user1Id = search1.user._id || search1.user;
      const user2Id = search2.user._id || search2.user;
      const matchId = `match_${user1Id}_${user2Id}`;
      
      console.log(`🔗 Initiating connection between ${user1Id} and ${user2Id}`);
      
      // Store the active match
      this.activeMatches.set(matchId, {
        user1: user1Id,
        user2: user2Id,
        search1: search1,
        search2: search2,
        status: 'pending_approval',
        createdAt: new Date(),
        approvals: new Set()
      });

      // Get user details for search1 user (might just be ID)
      const user1Data = search1.user.name ? search1.user : await User.findById(user1Id).select('name email contactInfo');
      const user2Data = search2.user.name ? search2.user : await User.findById(user2Id).select('name email contactInfo');

      // Create match data for user1
      const matchDataForUser1 = {
        matchId,
        partner: {
          id: user2Id,
          name: user2Data.name,
          pickup: search2.pickup,
          drop: search2.drop,
          type: search2.type
        },
        yourSearch: {
          pickup: search1.pickup,
          drop: search1.drop,
          type: search1.type
        },
        distance: this.calculateDistance(
          search1.pickupCoords.coordinates[1], search1.pickupCoords.coordinates[0],
          search2.pickupCoords.coordinates[1], search2.pickupCoords.coordinates[0]
        )
      };

      // Create match data for user2
      const matchDataForUser2 = {
        matchId,
        partner: {
          id: user1Id,
          name: user1Data.name || 'User',
          pickup: search1.pickup,
          drop: search1.drop,
          type: search1.type
        },
        yourSearch: {
          pickup: search2.pickup,
          drop: search2.drop,
          type: search2.type
        },
        distance: matchDataForUser1.distance
      };

      // Notify both users about the instant match
      console.log(`📢 Notifying users about match: ${user1Id} and ${user2Id}`);
      this.io.to(`search_${user1Id}`).emit('instant_match_found', matchDataForUser1);
      this.io.to(`search_${user2Id}`).emit('instant_match_found', matchDataForUser2);

      // Set timeout for match expiry (2 minutes)
      setTimeout(() => {
        this.expireMatch(matchId);
      }, 120000);

    } catch (error) {
      console.error('Error initiating instant connection:', error);
    }
  }

  /**
   * Handle user approval for a match
   * @param {string} matchId - Match ID
   * @param {string} userId - User ID approving
   * @param {Object} socket - User's socket
   */
  async handleMatchApproval(matchId, userId, socket) {
    try {
      const match = this.activeMatches.get(matchId);
      
      if (!match) {
        socket.emit('match_error', { message: 'Match not found or expired' });
        return;
      }

      if (match.status !== 'pending_approval') {
        socket.emit('match_error', { message: 'Match is no longer available' });
        return;
      }

      // Convert to strings for comparison
      const userIdStr = userId.toString();
      const user1Str = match.user1.toString();
      const user2Str = match.user2.toString();

      // Verify user is part of this match
      if (userIdStr !== user1Str && userIdStr !== user2Str) {
        socket.emit('match_error', { message: 'You are not part of this match' });
        return;
      }

      // Check if user already approved
      if (match.approvals.has(userIdStr)) {
        socket.emit('match_error', { message: 'You have already approved this match' });
        return;
      }

      // Add user's approval
      match.approvals.add(userIdStr);
      
      console.log(`✅ User ${userId} approved match ${matchId} (${match.approvals.size}/2 approvals)`);

      // Check if both users have approved
      if (match.approvals.size === 2) {
        // Both approved - establish connection
        console.log(`🤝 Both users approved match ${matchId}, establishing connection...`);
        await this.establishConnection(match);
      } else {
        // Only one user approved - notify the approving user and the other user
        const otherUserId = userIdStr === user1Str ? user2Str : user1Str;
        
        // Tell the approving user to wait
        socket.emit('approval_sent', { 
          message: 'Waiting for partner approval...',
          partnerId: otherUserId 
        });
        
        // Notify the other user that their partner approved (but don't change their UI state)
        this.io.to(`search_${otherUserId}`).emit('partner_approved', {
          message: 'Your partner approved the match! Approve to start chatting.',
          partnerId: userIdStr
        });
        
        console.log(`⏳ User ${userId} approved, waiting for user ${otherUserId} to approve`);
      }

    } catch (error) {
      console.error('Error handling match approval:', error);
      socket.emit('match_error', { message: 'Failed to process approval' });
    }
  }

  /**
   * Handle user denial for a match
   * @param {string} matchId - Match ID
   * @param {string} userId - User ID denying
   * @param {Object} socket - User's socket
   */
  async handleMatchDenial(matchId, userId, socket) {
    try {
      const match = this.activeMatches.get(matchId);
      
      if (!match) {
        socket.emit('match_error', { message: 'Match not found or expired' });
        return;
      }

      console.log(`❌ User ${userId} denied match ${matchId}`);

      // Cancel the match
      await this.cancelMatch(match, 'denied');
      
    } catch (error) {
      console.error('Error handling match denial:', error);
    }
  }

  /**
   * Establish connection between two users after both approve
   * @param {Object} match - Match object
   */
  async establishConnection(match) {
    try {
      console.log(`🤝 Establishing connection between ${match.user1} and ${match.user2}`);

      // Create chat room
      const chatRoomId = `chat_${match.user1}_${match.user2}`;
      
      // Update match status
      match.status = 'connected';
      match.chatRoomId = chatRoomId;

      // Join both users to chat room
      this.io.to(`search_${match.user1}`).socketsJoin(chatRoomId);
      this.io.to(`search_${match.user2}`).socketsJoin(chatRoomId);

      // Get user details for chat
      const [user1, user2] = await Promise.all([
        User.findById(match.user1).select('name email contactInfo'),
        User.findById(match.user2).select('name email contactInfo')
      ]);

      // Notify both users that connection is established
      const connectionData = {
        chatRoomId,
        partner: {
          id: match.user2,
          name: user2.name,
          email: user2.email,
          contactInfo: user2.contactInfo
        },
        route: {
          from: match.search1.pickup,
          to: match.search1.drop
        }
      };

      const reverseConnectionData = {
        chatRoomId,
        partner: {
          id: match.user1,
          name: user1.name,
          email: user1.email,
          contactInfo: user1.contactInfo
        },
        route: {
          from: match.search2.pickup,
          to: match.search2.drop
        }
      };

      this.io.to(`search_${match.user1}`).emit('connection_established', connectionData);
      this.io.to(`search_${match.user2}`).emit('connection_established', reverseConnectionData);

      // Send initial system message to chat
      this.io.to(chatRoomId).emit('chat_message', {
        type: 'system',
        message: `🎉 Connection established! You can now chat and coordinate your ride.`,
        timestamp: new Date()
      });

      // Clean up searches
      await ActiveSearch.deleteMany({ 
        user: { $in: [match.user1, match.user2] } 
      });

    } catch (error) {
      console.error('Error establishing connection:', error);
    }
  }

  /**
   * Cancel a match
   * @param {Object} match - Match object
   * @param {string} reason - Cancellation reason
   */
  async cancelMatch(match, reason = 'cancelled') {
    try {
      // Notify both users
      this.io.to(`search_${match.user1}`).emit('match_cancelled', {
        message: reason === 'denied' ? 'Match was declined by your partner' : 'Match expired',
        reason
      });
      
      this.io.to(`search_${match.user2}`).emit('match_cancelled', {
        message: reason === 'denied' ? 'Match was declined by your partner' : 'Match expired',
        reason
      });

      // Remove from active matches
      const matchId = `match_${match.user1}_${match.user2}`;
      this.activeMatches.delete(matchId);

      console.log(`🚫 Match cancelled: ${matchId} (${reason})`);

    } catch (error) {
      console.error('Error cancelling match:', error);
    }
  }

  /**
   * Expire a match after timeout
   * @param {string} matchId - Match ID
   */
  async expireMatch(matchId) {
    const match = this.activeMatches.get(matchId);
    if (match && match.status === 'pending_approval') {
      await this.cancelMatch(match, 'expired');
    }
  }

  /**
   * Handle chat message
   * @param {string} chatRoomId - Chat room ID
   * @param {string} userId - Sender user ID
   * @param {string} message - Message content
   * @param {Object} socket - Sender's socket
   */
  async handleChatMessage(chatRoomId, userId, message, socket) {
    try {
      // Get sender info
      const sender = await User.findById(userId).select('name');
      
      const messageData = {
        type: 'user',
        senderId: userId,
        senderName: sender.name,
        message: message.trim(),
        timestamp: new Date()
      };

      // Broadcast to chat room
      this.io.to(chatRoomId).emit('chat_message', messageData);
      
      console.log(`💬 Chat message in ${chatRoomId} from ${sender.name}: ${message}`);

    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('chat_error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle user disconnection
   * @param {string} userId - User ID
   */
  async handleUserDisconnect(userId) {
    try {
      const userIdStr = userId.toString();
      
      // Find and cancel any pending matches for this user
      for (const [matchId, match] of this.activeMatches.entries()) {
        const user1Str = match.user1.toString();
        const user2Str = match.user2.toString();
        
        if ((user1Str === userIdStr || user2Str === userIdStr) && 
            match.status === 'pending_approval') {
          await this.cancelMatch(match, 'disconnected');
        }
      }

      // Clean up user's active search
      await ActiveSearch.deleteMany({ user: userId });
      
      console.log(`🔌 User ${userId} disconnected - cleaned up searches and matches`);

    } catch (error) {
      console.error('Error handling user disconnect:', error);
    }
  }

  /**
   * Calculate distance between two coordinates
   * @param {number} lat1 - First latitude
   * @param {number} lng1 - First longitude
   * @param {number} lat2 - Second latitude
   * @param {number} lng2 - Second longitude
   * @returns {number} Distance in meters
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    // Handle same point scenario
    if (lat1 === lat2 && lng1 === lng2) {
      return 0;
    }

    // Handle very close points (difference less than 0.0001 degrees ≈ 10 meters)
    const latDiff = Math.abs(lat1 - lat2);
    const lngDiff = Math.abs(lng1 - lng2);
    
    if (latDiff < 0.0001 && lngDiff < 0.0001) {
      return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000; // Rough conversion to meters
    }

    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Stop continuous matching and cleanup
   */
  stopContinuousMatching() {
    if (this.matchingInterval) {
      clearInterval(this.matchingInterval);
      this.matchingInterval = null;
      console.log('🛑 Continuous matching stopped');
    }
  }
}

module.exports = RealTimeMatchingService;