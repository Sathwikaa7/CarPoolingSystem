const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    pickup: { type: String, required: true },
    drop: { type: String, required: true },

    dateTime: { type: Date, required: true },

    // 📍 Pickup location - GeoJSON format
    pickupCoords: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    },

    // 🎯 Drop location - GeoJSON format
    dropCoords: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    },

    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },

    type: {
      type: String,
      enum: ["poolCar", "findCar"],
      required: true,
    },

    isScheduled: {
      type: Boolean,
      default: false,
    },

    // Enhanced fields for ride matching
    availableSeats: { 
      type: Number, 
      default: 1,
      min: 0
    },
    connectedUsers: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }],
    isActive: { 
      type: Boolean, 
      default: true 
    }
  },
  { timestamps: true }
);

// Geospatial indexes for location-based queries
RideSchema.index({ pickupCoords: '2dsphere' });
RideSchema.index({ dropCoords: '2dsphere' });

// Compound indexes for performance optimization
RideSchema.index({ type: 1, isActive: 1, dateTime: 1 });
RideSchema.index({ user: 1, isActive: 1 });
RideSchema.index({ isActive: 1, availableSeats: 1 });

module.exports = mongoose.model("Ride", RideSchema);
