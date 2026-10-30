import mongoose from 'mongoose';
const matchSchema = new mongoose.Schema({
  item1_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  item2_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  score: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
export default mongoose.model('Match', matchSchema);
