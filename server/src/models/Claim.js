import mongoose from 'mongoose';
const claimSchema = new mongoose.Schema(
  {
    item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    evidence: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    review_reason: { type: String, maxlength: 1000 },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
claimSchema.index({ user_id: 1, created_at: -1 });
claimSchema.index({ item_id: 1, status: 1 });
claimSchema.index(
  { item_id: 1, user_id: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
export default mongoose.model('Claim', claimSchema);
