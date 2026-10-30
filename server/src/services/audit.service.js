import AuditLog from '../models/AuditLog.js';
export const AUDIT_ACTIONS = { USER_REGISTERED: 'user.registered', USER_LOGIN: 'user.login' };
export async function logSystemAction(data) {
  return await AuditLog.create({
    action: data.action,
    entity_type: data.entityType,
    entity_id: data.entityId,
    actor_user_id: data.actorUserId || null,
    new_state: data.newState || data.metadata || {}
  });
}
export async function record(data) { return logSystemAction(data); }
export default { AUDIT_ACTIONS, logSystemAction, record };
