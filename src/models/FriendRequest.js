import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema({
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  message: {
    type: String,
    maxlength: 200,
    default: ''
  }
}, {
  timestamps: true
});

// Ensure users can't send multiple pending requests to same user
friendRequestSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });

// Virtual for populated data
friendRequestSchema.virtual('fromUserData', {
  ref: 'User',
  localField: 'fromUser',
  foreignField: '_id',
  justOne: true
});

friendRequestSchema.virtual('toUserData', {
  ref: 'User',
  localField: 'toUser',
  foreignField: '_id',
  justOne: true
});

friendRequestSchema.set('toJSON', { virtuals: true });
friendRequestSchema.set('toObject', { virtuals: true });

export default mongoose.model("FriendRequest", friendRequestSchema);