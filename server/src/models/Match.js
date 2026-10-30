import mongoose from 'mongoose';
const matchSchema = new mongoose.Schema(
  {
    item1_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    item2_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    score: { type: Number, required: true },
    reasons: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: {
      type: String,
      enum: ['suggested', 'dismissed', 'claimed', 'resolved'],
      default: 'suggested',
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
matchSchema.index({ item1_id: 1, item2_id: 1 }, { unique: true });
matchSchema.index({ status: 1, score: -1 });
export default mongoose.model('Match', matchSchema);
