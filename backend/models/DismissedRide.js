const mongoose = require('mongoose');

const DismissedRideSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  ride: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Ride', 
    required: true 
  },
  dismissedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound index to ensure unique user-ride combinations and efficient queries
DismissedRideSchema.index({ user: 1, ride: 1 }, { unique: true });
DismissedRideSchema.index({ user: 1, dismissedAt: -1 });

module.exports = mongoose.model('DismissedRide', DismissedRideSchema);