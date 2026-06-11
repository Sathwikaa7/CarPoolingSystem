const axios = require('axios');

/**
 * Service for calculating distances and routes between locations
 * Uses external routing services with Haversine formula fallback
 */
class DistanceCalculationService {
  constructor(options = {}) {
    this.openRouteServiceUrl = options.apiUrl || 'https://api.openrouteservice.org/v2';
    this.apiKey = options.apiKey || process.env.OPENROUTE_API_KEY;
    this.requestTimeout = options.timeout || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 2;
  }

  /**
   * Calculate route between two points using external routing service
   * Falls back to Haversine formula if routing service fails
   * @param {Object} origin - {lat, lng}
   * @param {Object} destination - {lat, lng}
   * @returns {Promise<Object>} - {distance, duration, route?, error?}
   */
  async calculateRoute(origin, destination) {
    try {
      // Validate input coordinates
      this._validateCoordinates(origin);
      this._validateCoordinates(destination);

      // Try external routing service first
      if (this.apiKey) {
        const routeResult = await this._getRouteFromService(origin, destination);
        if (routeResult && routeResult.success) {
          return {
            distance: routeResult.distance,
            duration: routeResult.duration,
            route: routeResult.route,
            method: 'routing_service'
          };
        }
      }

      // Fallback to Haversine formula
      const straightLineDistance = this._calculateHaversineDistance(origin, destination);
      const estimatedDuration = this._estimateDuration(straightLineDistance);

      return {
        distance: straightLineDistance,
        duration: estimatedDuration,
        method: 'haversine',
        warning: 'Routing service unavailable, showing straight-line distance'
      };

    } catch (error) {
      console.error('Distance calculation error:', error);
      
      // Last resort fallback - only if coordinates are valid
      try {
        this._validateCoordinates(origin);
        this._validateCoordinates(destination);
        const fallbackDistance = this._calculateHaversineDistance(origin, destination);
        return {
          distance: fallbackDistance,
          duration: this._estimateDuration(fallbackDistance),
          method: 'haversine_fallback',
          error: 'Routing service failed, showing approximate distance'
        };
      } catch (fallbackError) {
        throw new Error('Unable to calculate distance: Invalid coordinates');
      }
    }
  }

  /**
   * Calculate distances from one origin to multiple destinations
   * Optimizes by batching requests when possible
   * @param {Object} origin - {lat, lng}
   * @param {Array} destinations - Array of {lat, lng} objects
   * @returns {Promise<Array>} - Array of distance calculation results
   */
  async batchCalculateDistances(origin, destinations) {
    try {
      this._validateCoordinates(origin);
      
      if (!Array.isArray(destinations) || destinations.length === 0) {
        throw new Error('Destinations must be a non-empty array');
      }

      // Validate all destination coordinates
      destinations.forEach((dest, index) => {
        try {
          this._validateCoordinates(dest);
        } catch (error) {
          throw new Error(`Invalid coordinates at destination index ${index}: ${error.message}`);
        }
      });

      // Try batch request to routing service if available
      if (this.apiKey && destinations.length > 1) {
        try {
          const batchResult = await this._getBatchRoutesFromService(origin, destinations);
          if (batchResult.success) {
            return batchResult.results;
          }
        } catch (error) {
          console.warn('Batch routing failed, falling back to individual requests:', error.message);
        }
      }

      // Fallback to individual calculations
      const results = [];
      for (let i = 0; i < destinations.length; i++) {
        try {
          const result = await this.calculateRoute(origin, destinations[i]);
          results.push(result);
        } catch (error) {
          results.push({
            distance: null,
            duration: null,
            error: error.message,
            method: 'failed'
          });
        }
      }

      return results;

    } catch (error) {
      console.error('Batch distance calculation error:', error);
      throw error;
    }
  }

  /**
   * Get route from external routing service (OpenRouteService)
   * @private
   */
  async _getRouteFromService(origin, destination) {
    let retries = 0;
    
    while (retries <= this.maxRetries) {
      try {
        const response = await axios.post(
          `${this.openRouteServiceUrl}/directions/driving-car`,
          {
            coordinates: [
              [origin.lng, origin.lat],
              [destination.lng, destination.lat]
            ]
          },
          {
            headers: {
              'Authorization': this.apiKey,
              'Content-Type': 'application/json'
            },
            timeout: this.requestTimeout
          }
        );

        if (response.data && response.data.routes && response.data.routes.length > 0) {
          const route = response.data.routes[0];
          return {
            success: true,
            distance: Math.round(route.summary.distance), // meters
            duration: Math.round(route.summary.duration), // seconds
            route: route.geometry // encoded polyline
          };
        }

        throw new Error('No route found in response');

      } catch (error) {
        retries++;
        
        if (retries > this.maxRetries) {
          console.warn(`Routing service failed after ${this.maxRetries} retries:`, error.message);
          return { success: false, error: error.message };
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  }

  /**
   * Get batch routes from external routing service
   * @private
   */
  async _getBatchRoutesFromService(origin, destinations) {
    try {
      // OpenRouteService matrix API for batch calculations
      const coordinates = [
        [origin.lng, origin.lat],
        ...destinations.map(dest => [dest.lng, dest.lat])
      ];

      const response = await axios.post(
        `${this.openRouteServiceUrl}/matrix/driving-car`,
        {
          locations: coordinates,
          sources: [0], // Only from origin
          destinations: destinations.map((_, index) => index + 1) // To all destinations
        },
        {
          headers: {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: this.requestTimeout * 2 // Longer timeout for batch
        }
      );

      if (response.data && response.data.distances && response.data.durations) {
        const distances = response.data.distances[0]; // First row (from origin)
        const durations = response.data.durations[0]; // First row (from origin)

        const results = destinations.map((dest, index) => ({
          distance: Math.round(distances[index + 1]), // meters
          duration: Math.round(durations[index + 1]), // seconds
          method: 'routing_service_batch'
        }));

        return { success: true, results };
      }

      throw new Error('Invalid batch response format');

    } catch (error) {
      console.warn('Batch routing service failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate straight-line distance using Haversine formula
   * @private
   */
  _calculateHaversineDistance(origin, destination) {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = this._toRadians(origin.lat);
    const lat2Rad = this._toRadians(destination.lat);
    const deltaLatRad = this._toRadians(destination.lat - origin.lat);
    const deltaLngRad = this._toRadians(destination.lng - origin.lng);

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance); // Return distance in meters
  }

  /**
   * Estimate duration based on straight-line distance
   * Assumes average speed of 50 km/h in urban areas
   * @private
   */
  _estimateDuration(distanceInMeters) {
    const averageSpeedKmh = 50;
    const distanceInKm = distanceInMeters / 1000;
    const durationInHours = distanceInKm / averageSpeedKmh;
    return Math.round(durationInHours * 3600); // Return duration in seconds
  }

  /**
   * Convert degrees to radians
   * @private
   */
  _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate coordinate object
   * @private
   */
  _validateCoordinates(coords) {
    if (!coords || typeof coords !== 'object') {
      throw new Error('Coordinates must be an object');
    }
    
    if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      throw new Error('Coordinates must have numeric lat and lng properties');
    }
    
    if (coords.lat < -90 || coords.lat > 90) {
      throw new Error('Latitude must be between -90 and 90 degrees');
    }
    
    if (coords.lng < -180 || coords.lng > 180) {
      throw new Error('Longitude must be between -180 and 180 degrees');
    }
  }

  /**
   * Format distance for display
   * @param {number} distanceInMeters
   * @returns {string}
   */
  static formatDistance(distanceInMeters) {
    if (distanceInMeters < 1000) {
      return `${distanceInMeters}m`;
    }
    return `${(distanceInMeters / 1000).toFixed(1)}km`;
  }

  /**
   * Format duration for display
   * @param {number} durationInSeconds
   * @returns {string}
   */
  static formatDuration(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}

module.exports = DistanceCalculationService;