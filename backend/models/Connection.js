const mongoose = require('mongoose');

const ConnectionSchema = new mongoose.Schema({
  requester: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  rideOwner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  ride: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Ride', 
    required: true 
  },
  message: { 
    type: String, 
    maxlength: 500 
  },
  requesterPickupLocation: {
    address: String,
    coords: { 
      lat: Number, 
      lng: Number 
    }
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  },
  respondedAt: Date
}, { timestamps: true });

// Index for efficient queries
ConnectionSchema.index({ rideOwner: 1, status: 1 });
ConnectionSchema.index({ requester: 1, status: 1 });
ConnectionSchema.index({ ride: 1 });
ConnectionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Connection', ConnectionSchema);