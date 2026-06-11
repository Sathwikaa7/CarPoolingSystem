const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ActiveSearch = require('../models/ActiveSearch');

/**
 * @route   POST /api/matching/start-realtime-search
 * @desc    Start real-time search for instant matching
 * @access  Private
 */
router.post('/start-realtime-search', auth, async (req, res) => {
  try {
    const { pickup, drop, pickupCoords, dropCoords, type } = req.body;

    // Validate required fields
    if (!pickup || !drop || !pickupCoords || !dropCoords || !type) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: pickup, drop, pickupCoords, dropCoords, type'
      });
    }

    if (!['findCar', 'poolCar'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "findCar" or "poolCar"'
      });
    }

    // Validate coordinates
    if (!pickupCoords.lat || !pickupCoords.lng || !dropCoords.lat || !dropCoords.lng) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates provided'
      });
    }

    console.log(`🔍 Starting real-time search for user ${req.user.id}: ${type} from ${pickup} to ${drop}`);

    // Remove any existing search for this user
    await ActiveSearch.deleteMany({ user: req.user.id });

    // The actual matching will be handled by Socket.IO
    // This endpoint just validates the request and confirms the search can start
    res.json({
      success: true,
      message: 'Real-time search ready to start',
      searchData: {
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        type,
        userId: req.user.id
      }
    });

  } catch (error) {
    console.error('Error starting real-time search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start real-time search'
    });
  }
});

/**
 * @route   GET /api/matching/active-search
 * @desc    Get user's current active search
 * @access  Private
 */
router.get('/active-search', auth, async (req, res) => {
  try {
    const activeSearch = await ActiveSearch.findOne({ user: req.user.id })
      .populate('user', 'name email');

    if (!activeSearch) {
      return res.json({
        success: true,
        data: null,
        message: 'No active search found'
      });
    }

    res.json({
      success: true,
      data: activeSearch
    });

  } catch (error) {
    console.error('Error fetching active search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active search'
    });
  }
});

/**
 * @route   DELETE /api/matching/stop-search
 * @desc    Stop current active search
 * @access  Private
 */
router.delete('/stop-search', auth, async (req, res) => {
  try {
    const result = await ActiveSearch.deleteMany({ user: req.user.id });
    
    console.log(`🛑 Stopped search for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Search stopped successfully',
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Error stopping search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop search'
    });
  }
});

/**
 * @route   GET /api/matching/stats
 * @desc    Get matching statistics
 * @access  Private
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const [totalSearches, findCarSearches, poolCarSearches] = await Promise.all([
      ActiveSearch.countDocuments(),
      ActiveSearch.countDocuments({ type: 'findCar' }),
      ActiveSearch.countDocuments({ type: 'poolCar' })
    ]);

    res.json({
      success: true,
      data: {
        totalActiveSearches: totalSearches,
        findCarSearches,
        poolCarSearches,
        userHasActiveSearch: await ActiveSearch.exists({ user: req.user.id }) !== null
      }
    });

  } catch (error) {
    console.error('Error fetching matching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch matching statistics'
    });
  }
});

/**
 * @route   POST /api/matching/test-match
 * @desc    Test matching between two locations (for debugging)
 * @access  Private
 */
router.post('/test-match', auth, async (req, res) => {
  try {
    const { 
      pickup1, drop1, pickupCoords1, dropCoords1, type1,
      pickup2, drop2, pickupCoords2, dropCoords2, type2
    } = req.body;

    // Calculate distances
    const calculateDistance = (lat1, lng1, lat2, lng2) => {
      if (lat1 === lat2 && lng1 === lng2) return 0;
      
      const latDiff = Math.abs(lat1 - lat2);
      const lngDiff = Math.abs(lng1 - lng2);
      
      if (latDiff < 0.0001 && lngDiff < 0.0001) {
        return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000;
      }

      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const pickupDistance = calculateDistance(
      pickupCoords1.lat, pickupCoords1.lng,
      pickupCoords2.lat, pickupCoords2.lng
    );

    const dropDistance = calculateDistance(
      dropCoords1.lat, dropCoords1.lng,
      dropCoords2.lat, dropCoords2.lng
    );

    const isCompatible = pickupDistance <= 5000 && dropDistance <= 5000;
    const hasOppositeTypes = (type1 === 'findCar' && type2 === 'poolCar') || 
                            (type1 === 'poolCar' && type2 === 'findCar');

    res.json({
      success: true,
      data: {
        route1: `${pickup1} → ${drop1} (${type1})`,
        route2: `${pickup2} → ${drop2} (${type2})`,
        pickupDistance: Math.round(pickupDistance),
        dropDistance: Math.round(dropDistance),
        isCompatible,
        hasOppositeTypes,
        wouldMatch: isCompatible && hasOppositeTypes
      }
    });

  } catch (error) {
    console.error('Error testing match:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test match'
    });
  }
});

module.exports = router;