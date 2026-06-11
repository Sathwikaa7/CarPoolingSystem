const express = require('express');
const router = express.Router();
const ConnectionService = require('../services/ConnectionService');
const auth = require('../middleware/auth');

const connectionService = new ConnectionService();

/**
 * @route   POST /api/connections/request
 * @desc    Create a new connection request
 * @access  Private
 */
router.post('/request', auth, async (req, res) => {
  try {
    const { rideId, message, pickupLocation } = req.body;

    // Validate required fields
    if (!rideId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ride ID is required' 
      });
    }

    if (!pickupLocation || !pickupLocation.coords) {
      return res.status(400).json({ 
        success: false, 
        message: 'Pickup location with coordinates is required' 
      });
    }

    const requestData = {
      requesterId: req.user.id,
      rideId,
      message,
      pickupLocation
    };

    const connectionRequest = await connectionService.createConnectionRequest(requestData);

    res.status(201).json({
      success: true,
      message: 'Connection request sent successfully',
      data: connectionRequest
    });

  } catch (error) {
    console.error('Error creating connection request:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   PUT /api/connections/:connectionId/respond
 * @desc    Respond to a connection request (accept/decline)
 * @access  Private
 */
router.put('/:connectionId/respond', auth, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { response } = req.body;

    if (!response || !['accepted', 'declined'].includes(response)) {
      return res.status(400).json({
        success: false,
        message: 'Valid response (accepted/declined) is required'
      });
    }

    const updatedConnection = await connectionService.respondToConnectionRequest(
      connectionId,
      req.user.id,
      response
    );

    res.json({
      success: true,
      message: `Connection request ${response} successfully`,
      data: updatedConnection
    });

  } catch (error) {
    console.error('Error responding to connection request:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   GET /api/connections/received
 * @desc    Get connection requests received by the user (as ride owner)
 * @access  Private
 */
router.get('/received', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    const requests = await connectionService.getConnectionRequestsForOwner(
      req.user.id,
      status
    );

    res.json({
      success: true,
      data: requests
    });

  } catch (error) {
    console.error('Error fetching received connection requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connection requests'
    });
  }
});

/**
 * @route   GET /api/connections/sent
 * @desc    Get connection requests sent by the user
 * @access  Private
 */
router.get('/sent', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    const requests = await connectionService.getConnectionRequestsByRequester(
      req.user.id,
      status
    );

    res.json({
      success: true,
      data: requests
    });

  } catch (error) {
    console.error('Error fetching sent connection requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connection requests'
    });
  }
});

/**
 * @route   GET /api/connections/accepted
 * @desc    Get all accepted connections for the user
 * @access  Private
 */
router.get('/accepted', auth, async (req, res) => {
  try {
    const connections = await connectionService.getAcceptedConnections(req.user.id);

    res.json({
      success: true,
      data: connections
    });

  } catch (error) {
    console.error('Error fetching accepted connections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accepted connections'
    });
  }
});

/**
 * @route   DELETE /api/connections/:connectionId/cancel
 * @desc    Cancel a pending connection request
 * @access  Private
 */
router.delete('/:connectionId/cancel', auth, async (req, res) => {
  try {
    const { connectionId } = req.params;

    const cancelledConnection = await connectionService.cancelConnectionRequest(
      connectionId,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Connection request cancelled successfully',
      data: cancelledConnection
    });

  } catch (error) {
    console.error('Error cancelling connection request:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   GET /api/connections/stats
 * @desc    Get connection statistics for the user
 * @access  Private
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await connectionService.getConnectionStats(req.user.id);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching connection stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connection statistics'
    });
  }
});

/**
 * @route   POST /api/connections/expire-pending
 * @desc    Manually trigger expiration of pending requests (admin/cron job)
 * @access  Private
 */
router.post('/expire-pending', auth, async (req, res) => {
  try {
    await connectionService.expirePendingRequests();

    res.json({
      success: true,
      message: 'Pending requests expired successfully'
    });

  } catch (error) {
    console.error('Error expiring pending requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to expire pending requests'
    });
  }
});

module.exports = router;