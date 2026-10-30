import mongoose from 'mongoose';
const notificationSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    is_read: { type: Boolean, default: false },
    reference_id: { type: mongoose.Schema.Types.ObjectId },
    reference_type: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
notificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });
export default mongoose.model('Notification', notificationSchema);
