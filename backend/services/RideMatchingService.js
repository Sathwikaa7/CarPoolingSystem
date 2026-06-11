const Ride = require('../models/Ride');
const DismissedRide = require('../models/DismissedRide');

class RideMatchingService {
  /**
   * Find matching rides based on search criteria
   * @param {Object} searchCriteria - Search parameters
   * @param {string} searchCriteria.pickup - Pickup location string
   * @param {string} searchCriteria.drop - Drop location string
   * @param {Object} searchCriteria.pickupCoords - Pickup coordinates {lat, lng}
   * @param {Object} searchCriteria.dropCoords - Drop coordinates {lat, lng}
   * @param {string} searchCriteria.type - Ride type ('poolCar' or 'findCar')
   * @param {string} userId - ID of the user searching for rides
   * @returns {Promise<Array>} Array of matching rides with relevance scores
   */
  async findMatches(searchCriteria, userId) {
    try {
      const { pickupCoords, dropCoords, type } = searchCriteria;
      
      if (!pickupCoords || !pickupCoords.lat || !pickupCoords.lng) {
        throw new Error('Pickup coordinates are required');
      }

      // Get dismissed rides for this user
      const dismissedRides = await this.getDismissedRideIds(userId);

      // Build the base query for rides within 5km radius of pickup location
      const baseQuery = {
        type: type === 'findCar' ? 'poolCar' : 'findCar', // Find opposite type
        isActive: true,
        availableSeats: { $gt: 0 }, // Exclude full rides
        user: { $ne: userId }, // Exclude user's own rides
        _id: { $nin: dismissedRides }, // Exclude dismissed rides
        pickupCoords: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [pickupCoords.lng, pickupCoords.lat]
            },
            $maxDistance: 5000 // 5km in meters
          }
        }
      };

      // Execute the geospatial query
      const nearbyRides = await Ride.find(baseQuery)
        .populate('user', 'name email contactInfo')
        .lean();

      // Filter by destination matching and calculate relevance scores
      const matchingRides = [];
      
      for (const ride of nearbyRides) {
        const destinationMatch = this.checkDestinationMatch(
          searchCriteria, 
          { drop: ride.drop, dropCoords: ride.dropCoords }
        );
        
        if (destinationMatch) {
          const relevanceScore = await this.calculateRelevanceScore(ride, searchCriteria);
          matchingRides.push({
            ...ride,
            relevanceScore,
            pickupDistance: this.calculateHaversineDistance(
              pickupCoords,
              ride.pickupCoords
            )
          });
        }
      }

      // Sort by relevance score (highest first)
      return matchingRides.sort((a, b) => b.relevanceScore - a.relevanceScore);

    } catch (error) {
      console.error('Error in findMatches:', error);
      throw error;
    }
  }

  /**
   * Check if destinations match using keyword matching and distance
   * @param {Object} searchCriteria - User's search criteria
   * @param {Object} rideData - Ride's destination data
   * @returns {boolean} True if destinations match
   */
  checkDestinationMatch(searchCriteria, rideData) {
    const { drop: searchDrop, dropCoords: searchDropCoords } = searchCriteria;
    const { drop: rideDrop, dropCoords: rideDropCoords } = rideData;

    // Keyword matching - check if destinations have common words
    if (searchDrop && rideDrop) {
      const searchKeywords = this.extractKeywords(searchDrop);
      const rideKeywords = this.extractKeywords(rideDrop);
      
      const hasCommonKeywords = searchKeywords.some(keyword => 
        rideKeywords.includes(keyword)
      );
      
      if (hasCommonKeywords) {
        return true;
      }
    }

    // Distance-based matching - check if within 10km
    if (searchDropCoords && rideDropCoords && 
        searchDropCoords.lat && searchDropCoords.lng &&
        rideDropCoords.lat && rideDropCoords.lng) {
      
      const distance = this.calculateHaversineDistance(searchDropCoords, rideDropCoords);
      return distance <= 10000; // 10km in meters
    }

    return false;
  }

  /**
   * Extract keywords from location string for matching
   * @param {string} location - Location string
   * @returns {Array<string>} Array of normalized keywords
   */
  extractKeywords(location) {
    if (!location || typeof location !== 'string') {
      return [];
    }

    return location
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2) // Filter out short words
      .filter(word => !['the', 'and', 'or', 'in', 'at', 'to', 'from'].includes(word)); // Remove common words
  }

  /**
   * Calculate relevance score based on distance and destination similarity
   * @param {Object} ride - Ride object
   * @param {Object} searchCriteria - Search criteria
   * @returns {Promise<number>} Relevance score (0-100)
   */
  async calculateRelevanceScore(ride, searchCriteria) {
    let score = 0;

    // Distance score (40% weight) - closer is better
    const pickupDistance = this.calculateHaversineDistance(
      searchCriteria.pickupCoords,
      ride.pickupCoords
    );
    const distanceScore = Math.max(0, 100 - (pickupDistance / 50)); // 50m = 1 point deduction
    score += distanceScore * 0.4;

    // Destination similarity score (40% weight)
    const destinationScore = this.calculateDestinationSimilarity(
      searchCriteria,
      { drop: ride.drop, dropCoords: ride.dropCoords }
    );
    score += destinationScore * 0.4;

    // Available seats bonus (10% weight)
    const seatsScore = Math.min(ride.availableSeats * 10, 50); // Max 50 points for seats
    score += seatsScore * 0.1;

    // Recency bonus (10% weight) - newer rides get slight preference
    const rideAge = Date.now() - new Date(ride.createdAt).getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const recencyScore = Math.max(0, 100 - (rideAge / maxAge * 100));
    score += recencyScore * 0.1;

    return Math.min(100, Math.max(0, score)); // Clamp between 0-100
  }

  /**
   * Calculate destination similarity score
   * @param {Object} searchCriteria - Search criteria
   * @param {Object} rideData - Ride destination data
   * @returns {number} Similarity score (0-100)
   */
  calculateDestinationSimilarity(searchCriteria, rideData) {
    const { drop: searchDrop, dropCoords: searchDropCoords } = searchCriteria;
    const { drop: rideDrop, dropCoords: rideDropCoords } = rideData;

    let similarityScore = 0;

    // Keyword similarity (60% of destination score)
    if (searchDrop && rideDrop) {
      const searchKeywords = this.extractKeywords(searchDrop);
      const rideKeywords = this.extractKeywords(rideDrop);
      
      if (searchKeywords.length > 0) {
        const commonKeywords = searchKeywords.filter(keyword => 
          rideKeywords.includes(keyword)
        );
        const keywordSimilarity = (commonKeywords.length / searchKeywords.length) * 100;
        similarityScore += keywordSimilarity * 0.6;
      }
    }

    // Distance similarity (40% of destination score)
    if (searchDropCoords && rideDropCoords && 
        searchDropCoords.lat && searchDropCoords.lng &&
        rideDropCoords.lat && rideDropCoords.lng) {
      
      const distance = this.calculateHaversineDistance(searchDropCoords, rideDropCoords);
      const maxDistance = 10000; // 10km
      const distanceSimilarity = Math.max(0, 100 - (distance / maxDistance * 100));
      similarityScore += distanceSimilarity * 0.4;
    }

    return similarityScore;
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {Object} coord1 - First coordinate {lat, lng}
   * @param {Object} coord2 - Second coordinate {lat, lng}
   * @returns {number} Distance in meters
   */
  calculateHaversineDistance(coord1, coord2) {
    if (!coord1 || !coord2 || !coord1.lat || !coord1.lng || !coord2.lat || !coord2.lng) {
      return Infinity;
    }

    const R = 6371000; // Earth's radius in meters
    const lat1Rad = coord1.lat * Math.PI / 180;
    const lat2Rad = coord2.lat * Math.PI / 180;
    const deltaLatRad = (coord2.lat - coord1.lat) * Math.PI / 180;
    const deltaLngRad = (coord2.lng - coord1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  /**
   * Get array of dismissed ride IDs for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of dismissed ride IDs
   */
  async getDismissedRideIds(userId) {
    try {
      const dismissedRides = await DismissedRide.find({ user: userId })
        .select('ride')
        .lean();
      
      return dismissedRides.map(dr => dr.ride);
    } catch (error) {
      console.error('Error fetching dismissed rides:', error);
      return [];
    }
  }
}

module.exports = RideMatchingService;