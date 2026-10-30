import { badRequest, notFound, forbidden } from '../../utils/httpError.js';
import Item from '../../models/Item.js';
import Claim from '../../models/Claim.js';
import * as auditService from '../../services/audit.service.js';

export function mapClaim(claim, isOwnerOrAdmin = false) {
  const result = {
    claimId: claim._id.toString(),
    itemId: claim.item_id.toString(),
    claimantId: claim.user_id.toString(),
    status: claim.status,
    claimMessage: claim.message,
    createdAt: claim.created_at,
    updatedAt: claim.updated_at
  };
  if (isOwnerOrAdmin) result.privateEvidence = claim.evidence;
  return result;
}
export async function submitClaim(itemId, data, user) {
  const item = await Item.findById(itemId);
  if (!item) throw notFound('Item not found');
  if (item.type !== 'found') throw badRequest('Can only claim found items');
  const claim = await Claim.create({ item_id: itemId, user_id: user.userId, message: data.claimMessage, evidence: data.privateEvidence || null });
  await auditService.logSystemAction({ action: 'claim.submitted', entityType: 'claim', entityId: claim._id.toString(), actorUserId: user.userId });
  return mapClaim(claim, true);
}
export async function listMyClaims(userId, params) {
  const query = { user_id: userId };
  if (params.status) query.status = params.status;
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const total = await Claim.countDocuments(query);
  const claims = await Claim.find(query).sort({ created_at: -1 }).skip(offset).limit(limit);
  return { rows: claims.map(c => mapClaim(c, true)), meta: { page, limit, total } };
}
export async function listClaimQueue(params) {
  const query = {};
  if (params.status) query.status = params.status;
  else if (!params.includeDecided) query.status = 'pending';
  if (params.itemId) query.item_id = params.itemId;
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const total = await Claim.countDocuments(query);
  const claims = await Claim.find(query).populate('item_id').sort({ created_at: 1 }).skip(offset).limit(limit);
  return { rows: claims.map(c => mapClaim(c, true)), meta: { page, limit, total } };
}
export async function getClaimForReview(claimId) {
  const claim = await Claim.findById(claimId).populate('item_id');
  if (!claim) return null;
  return mapClaim(claim, true);
}
export async function decideClaim(claimId, data, user) {
  if (user.role !== 'admin') throw forbidden('Admin only');
  const claim = await Claim.findById(claimId);
  if (!claim) throw notFound('Claim not found');
  if (claim.status !== 'pending') throw badRequest('Claim is not pending');
  claim.status = data.decision;
  await claim.save();
  if (data.decision === 'approved') await Item.findByIdAndUpdate(claim.item_id, { status: 'resolved' });
  await auditService.logSystemAction({ action: `claim.${data.decision}`, entityType: 'claim', entityId: claim._id.toString(), actorUserId: user.userId });
  return mapClaim(claim, true);
}
export async function withdrawClaim(claimId, user) {
  const claim = await Claim.findById(claimId);
  if (!claim) throw notFound('Claim not found');
  if (claim.user_id.toString() !== user.userId.toString()) throw forbidden('Not your claim');
  if (claim.status !== 'pending') throw badRequest('Only pending claims can be withdrawn');
  claim.status = 'withdrawn';
  await claim.save();
  await auditService.logSystemAction({ action: 'claim.withdrawn', entityType: 'claim', entityId: claim._id.toString(), actorUserId: user.userId });
  return mapClaim(claim, true);
}
export default { submitClaim, listMyClaims, listClaimQueue, getClaimForReview, decideClaim, withdrawClaim };
