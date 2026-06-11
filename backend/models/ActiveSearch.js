const mongoose = require("mongoose");

const ActiveSearchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pickup: { type: String, required: true },
    drop: { type: String, required: true },
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
    type: {
      type: String,
      enum: ["poolCar", "findCar"],
      required: true,
    },
    // Auto-expire after 3 minutes
    expiresAt: {
      type: Date,
      default: Date.now,
      expires: 180 // 3 minutes in seconds
    }
  },
  { timestamps: true }
);

// Index for geospatial queries
ActiveSearchSchema.index({ pickupCoords: "2dsphere" });
ActiveSearchSchema.index({ dropCoords: "2dsphere" });

module.exports = mongoose.model("ActiveSearch", ActiveSearchSchema);