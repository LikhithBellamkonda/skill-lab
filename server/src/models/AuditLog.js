import mongoose from 'mongoose';
const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  entity_type: { type: String, required: true },
  entity_id: { type: String, required: true },
  actor_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  new_state: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
export default mongoose.model('AuditLog', auditLogSchema);
