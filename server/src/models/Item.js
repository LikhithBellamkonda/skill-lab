import mongoose from 'mongoose';
const itemSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    type: { type: String, enum: ['lost', 'found'], required: true },
    colour: { type: String, trim: true, maxlength: 50 },
    brand: { type: String, trim: true, maxlength: 100 },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    location_name: { type: String },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
    verification_hint: { type: String, maxlength: 500 },
    images: [
      {
        url: { type: String, required: true },
        alt_text: { type: String, maxlength: 200 },
        uploaded_at: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ['open', 'matched', 'claimed', 'returned', 'closed', 'rejected'],
      default: 'open',
    },
    deleted_at: { type: Date, default: null },
    closed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
itemSchema.index({ location: '2dsphere' });
itemSchema.index({ status: 1, type: 1, created_at: -1 });
itemSchema.index({ user_id: 1, created_at: -1 });
export default mongoose.model('Item', itemSchema);
