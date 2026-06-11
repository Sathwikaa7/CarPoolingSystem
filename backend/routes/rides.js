const express = require("express");
const router = express.Router();
const Ride = require("../models/Ride");
const ActiveSearch = require("../models/ActiveSearch");
const auth = require("../middleware/auth");
const axios = require("axios");
const mongoose = require("mongoose");

// ----------------------------------------------------------
// ROUTE FETCH (GOOGLE → OSRM fallback)
// ----------------------------------------------------------

// Decode a Google Maps encoded polyline into [[lng, lat], ...] pairs
function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e5, lat / 1e5]); // [lng, lat] to match GeoJSON / OSRM format
  }
  return coords;
}

router.post("/route", auth, async (req, res) => {
  try {
    const { start, end } = req.body;

    if (!start || !end) {
      return res.status(400).json({ msg: "Missing coordinates" });
    }

    if (process.env.GOOGLE_MAPS_API) {
      try {
        const googleRes = await axios.post(
          "https://routes.googleapis.com/directions/v2:computeRoutes",
          {
            origin: { location: { latLng: start } },
            destination: { location: { latLng: end } },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API,
              "X-Goog-FieldMask":
                "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
            },
          }
        );

        const route = googleRes.data.routes[0];
        // Decode Google's encoded polyline into [lng, lat] array — same format as OSRM
        const coordinates = decodePolyline(route.polyline.encodedPolyline);

        return res.json({
          geometry: { coordinates },
          distance: route.distanceMeters,
          duration: parseInt(route.duration.replace("s", "")),
        });
      } catch (e) {
        console.log("Google Maps failed → Using OSRM");
      }
    }

    const osrm = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
    );

    const r = osrm.data.routes[0];

    return res.json({
      geometry: { coordinates: r.geometry.coordinates },
      distance: r.distance,
      duration: r.duration,
    });
  } catch (err) {
    console.log("Route API error:", err);
    return res.status(500).json({ msg: "Route fetch failed" });
  }
});

// ----------------------------------------------------------
// BOOK RIDE (POOL / FIND)
// ----------------------------------------------------------
router.post("/book", auth, async (req, res) => {
  try {
    const { pickup, drop, pickupCoords, dropCoords, dateTime, type, isScheduled } = req.body;

    if (!pickup || !drop || !dateTime || !type) {
      return res.status(400).json({ message: "All fields required" });
    }

    if (!pickupCoords || !pickupCoords.lat || !pickupCoords.lng) {
      return res.status(400).json({
        message: "Pickup coordinates are required for map & matching",
      });
    }

    // ADD DROP COORDS VALIDATION
    if (!dropCoords || !dropCoords.lat || !dropCoords.lng) {
      return res.status(400).json({
        message: "Drop coordinates are required for map & matching",
      });
    }

    if (!["poolCar", "findCar"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Type must be 'poolCar' or 'findCar'" });
    }

    if (isScheduled) {
      const selectedDateTime = new Date(dateTime);
      const now = new Date();
      if (selectedDateTime <= now) {
        return res.status(400).json({
          message: "Scheduled rides must be set for a future date and time",
        });
      }
    }

    const ride = await Ride.create({
      user: req.user.id,
      pickup,
      drop,
      dateTime,
      type,
      status: "pending",
      isScheduled: isScheduled || false,
      pickupCoords: {
        type: 'Point',
        coordinates: [pickupCoords.lng, pickupCoords.lat]
      },
      dropCoords: {
        type: 'Point',
        coordinates: [dropCoords.lng, dropCoords.lat]
      },
    });

    res.json({
      message: "Ride booked successfully",
      ride,
    });
  } catch (err) {
    console.log("Booking error:", err);
    res.status(400).json({ msg: "Booking failed" });
  }
});

// ----------------------------------------------------------
// GET MY RIDES
// ----------------------------------------------------------
router.get("/my", auth, async (req, res) => {
  const rides = await Ride.find({ user: req.user.id }).sort({ dateTime: -1 });
  res.json(rides);
});

// ----------------------------------------------------------
// STATS
// ----------------------------------------------------------
router.get("/stats", auth, async (req, res) => {
  const rides = await Ride.find({ user: req.user.id });

  res.json({
    total: rides.length,
    pending: rides.filter((r) => r.status === "pending").length,
    completed: rides.filter((r) => r.status === "completed").length,
  });
});

// ----------------------------------------------------------
// COMPLETE A RIDE
// ----------------------------------------------------------
router.put("/:id/complete", auth, async (req, res) => {
  try {
    const updated = await Ride.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { status: "completed" },
      { new: true }
    );

    if (!updated)
      return res.status(404).json({ msg: "Ride not found" });

    res.json({ msg: "Ride completed" });
  } catch (err) {
    res.status(400).json({ msg: "Failed to complete ride" });
  }
});

// ----------------------------------------------------------
// CANCEL RIDE
// ----------------------------------------------------------
router.delete("/:id", auth, async (req, res) => {
  try {
    const ride = await Ride.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!ride) {
      return res.status(404).json({ msg: "Ride not found" });
    }

    await ride.deleteOne();

    console.log(`❌ Ride cancelled: ${ride._id}`);

    res.json({ msg: "Ride cancelled successfully" });

  } catch (err) {
    console.error("Cancel ride error:", err);
    res.status(500).json({ msg: "Failed to cancel ride" });
  }
});

// ----------------------------------------------------------
// FIND NEARBY RIDES (FOR MAP) - UPDATED WITH PICKUP + DROP MATCHING
// ----------------------------------------------------------
router.post("/find", auth, async (req, res) => {
  try {
    const { lat, lng, drop } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ msg: "Location required" });
    }

    // Find all pending rides from other users with coordinates using GeoJSON
    const rides = await Ride.find({
      status: "pending",
      user: { $ne: req.user.id },
      pickupCoords: { 
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          $maxDistance: 50000 // 50km in meters
        }
      },
      type: "poolCar" // Only show rides offering pools
    }).populate('user', 'name email'); // Include user details

    console.log("ALL POOL CAR RIDES:", rides.length);

    // Convert coordinates back to lat/lng format for frontend compatibility
    const ridesWithLatLng = rides.map(ride => ({
      ...ride.toObject(),
      pickupCoords: {
        lat: ride.pickupCoords.coordinates[1],
        lng: ride.pickupCoords.coordinates[0]
      },
      dropCoords: {
        lat: ride.dropCoords.coordinates[1],
        lng: ride.dropCoords.coordinates[0]
      }
    }));

    console.log("NEARBY RIDES:", ridesWithLatLng.length);

    res.json(ridesWithLatLng);
  } catch (err) {
    console.error("Find rides error:", err);
    res.status(500).json({ msg: "Failed to find nearby rides" });
  }
});

// ----------------------------------------------------------
// CONNECT TO A RIDE
// ----------------------------------------------------------
router.post("/connect", auth, async (req, res) => {
  try {
    const { rideId, message } = req.body;

    if (!rideId) {
      return res.status(400).json({ msg: "Ride ID is required" });
    }

    const ride = await Ride.findById(rideId).populate('user', 'name email');
    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    if (ride.user._id.toString() === req.user.id) {
      return res.status(400).json({ msg: "Cannot connect to your own ride" });
    }

    if (!ride.isActive || ride.availableSeats <= 0) {
      return res.status(400).json({ msg: "Ride is no longer available" });
    }

    const Connection = require("../models/Connection");
    const User = require("../models/User");

    // Prevent duplicate pending requests
    const existing = await Connection.findOne({
      requester: req.user.id,
      ride: rideId,
      status: "pending",
    });
    if (existing) {
      return res.status(400).json({ msg: "You already have a pending request for this ride" });
    }

    const currentUser = await User.findById(req.user.id).select('name email');

    const connection = await Connection.create({
      requester: req.user.id,
      rideOwner: ride.user._id,
      ride: rideId,
      message: message || "",
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    res.status(201).json({
      message: "Connection request sent successfully",
      connectionId: connection._id,
      rideOwner: { name: ride.user.name },
      requester: { name: currentUser.name, email: currentUser.email },
    });

  } catch (err) {
    console.error("Connect error:", err);
    res.status(500).json({ msg: "Failed to connect to ride" });
  }
});

// ----------------------------------------------------------
// START LIVE SEARCH (REAL-TIME MATCHING)
// ----------------------------------------------------------
router.post("/start-live-search", auth, async (req, res) => {
  try {
    const { pickup, drop, pickupCoords, dropCoords, type } = req.body;

    if (!pickup || !drop || !pickupCoords || !dropCoords || !type) {
      return res.status(400).json({ msg: "All fields required" });
    }

    console.log(`🔍 Starting live search for user ${req.user.id}`);
    console.log(`Type: ${type}, Route: ${pickup} → ${drop}`);

    // Remove any existing search for this user
    await ActiveSearch.deleteMany({ user: req.user.id });

    // Create new active search
    const activeSearch = await ActiveSearch.create({
      user: req.user.id,
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

    // Immediately look for matches
    const oppositeType = type === "findCar" ? "poolCar" : "findCar";
    
    const matches = await ActiveSearch.find({
      user: { $ne: req.user.id },
      type: oppositeType,
      // Find searches within 5km radius using GeoJSON
      pickupCoords: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [pickupCoords.lng, pickupCoords.lat]
          },
          $maxDistance: 5000 // 5km in meters
        }
      }
    }).populate('user', 'name email');

    // Filter by route similarity
    const compatibleMatches = matches.filter(match => {
      const pickupDistance = calculateDistance(
        pickupCoords.lat, pickupCoords.lng,
        match.pickupCoords.coordinates[1], match.pickupCoords.coordinates[0]
      );
      
      const dropDistance = calculateDistance(
        dropCoords.lat, dropCoords.lng,
        match.dropCoords.coordinates[1], match.dropCoords.coordinates[0]
      );

      // Both pickup and drop should be within 3km
      return pickupDistance <= 3 && dropDistance <= 3;
    });

    console.log(`Found ${compatibleMatches.length} live matches`);

    res.json({
      searchId: activeSearch._id,
      matches: compatibleMatches,
      message: `Live search started. Found ${compatibleMatches.length} active matches.`
    });

  } catch (err) {
    console.error("Start live search error:", err);
    res.status(500).json({ msg: "Failed to start live search" });
  }
});

// ----------------------------------------------------------
// GET LIVE MATCHES (POLLING ENDPOINT)
// ----------------------------------------------------------
router.get("/live-matches", auth, async (req, res) => {
  try {
    // Find user's active search
    const userSearch = await ActiveSearch.findOne({ user: req.user.id });
    
    if (!userSearch) {
      return res.json({ matches: [], message: "No active search" });
    }

    const oppositeType = userSearch.type === "findCar" ? "poolCar" : "findCar";
    
    // Find compatible active searches
    const matches = await ActiveSearch.find({
      user: { $ne: req.user.id },
      type: oppositeType,
      pickupCoords: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [userSearch.pickupCoords.coordinates[0], userSearch.pickupCoords.coordinates[1]]
          },
          $maxDistance: 5000 // 5km
        }
      }
    }).populate('user', 'name email');

    // Filter by route compatibility
    const compatibleMatches = matches.filter(match => {
      const pickupDistance = calculateDistance(
        userSearch.pickupCoords.coordinates[1], userSearch.pickupCoords.coordinates[0],
        match.pickupCoords.coordinates[1], match.pickupCoords.coordinates[0]
      );
      
      const dropDistance = calculateDistance(
        userSearch.dropCoords.coordinates[1], userSearch.dropCoords.coordinates[0],
        match.dropCoords.coordinates[1], match.dropCoords.coordinates[0]
      );

      return pickupDistance <= 3 && dropDistance <= 3;
    });

    res.json({
      matches: compatibleMatches,
      userSearch: {
        type: userSearch.type,
        pickup: userSearch.pickup,
        drop: userSearch.drop
      }
    });

  } catch (err) {
    console.error("Get live matches error:", err);
    res.status(500).json({ msg: "Failed to get live matches" });
  }
});

// ----------------------------------------------------------
// STOP LIVE SEARCH
// ----------------------------------------------------------
router.delete("/stop-live-search", auth, async (req, res) => {
  try {
    await ActiveSearch.deleteMany({ user: req.user.id });
    console.log(`🛑 Stopped live search for user ${req.user.id}`);
    
    res.json({ message: "Live search stopped" });
  } catch (err) {
    console.error("Stop live search error:", err);
    res.status(500).json({ msg: "Failed to stop live search" });
  }
});

// ----------------------------------------------------------
// SEND CONNECTION REQUEST
// ----------------------------------------------------------
router.post("/send-connection-request", auth, async (req, res) => {
  try {
    const { targetUserId, message } = req.body;

    if (!targetUserId || !message) {
      return res.status(400).json({ msg: "Target user and message required" });
    }

    // Find both users' active searches
    const userSearch = await ActiveSearch.findOne({ user: req.user.id }).populate('user', 'name email');
    const targetSearch = await ActiveSearch.findOne({ user: targetUserId }).populate('user', 'name email');

    if (!userSearch || !targetSearch) {
      return res.status(400).json({ msg: "One or both users are not actively searching" });
    }

    // Create connection request (you can store this in a separate model if needed)
    console.log(`📞 Connection request from ${userSearch.user.name} to ${targetSearch.user.name}`);
    console.log(`Message: ${message}`);

    // For now, we'll return the connection details
    // In a real app, you'd store this and notify the target user
    res.json({
      message: "Connection request sent",
      from: {
        name: userSearch.user.name,
        email: userSearch.user.email,
        route: `${userSearch.pickup} → ${userSearch.drop}`,
        type: userSearch.type
      },
      to: {
        name: targetSearch.user.name,
        email: targetSearch.user.email,
        route: `${targetSearch.pickup} → ${targetSearch.drop}`,
        type: targetSearch.type
      }
    });

  } catch (err) {
    console.error("Send connection request error:", err);
    res.status(500).json({ msg: "Failed to send connection request" });
  }
});

// Helper function for distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = router;