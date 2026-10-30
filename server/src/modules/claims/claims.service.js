import { badRequest, conflict, forbidden, notFound } from '../../utils/httpError.js';
import Item from '../../models/Item.js';
import Claim from '../../models/Claim.js';
import Match from '../../models/Match.js';
import * as auditService from '../../services/audit.service.js';
import * as notificationService from '../../services/notification.service.js';

function mapClaim(claim, includePrivate = false) {
  const item = claim.item_id;
  const claimant = claim.user_id;
  const isPopulatedItem = Boolean(item?.title);
  const isPopulatedClaimant = Boolean(claimant?.full_name);
  const mapped = {
    claimId: claim._id.toString(),
    itemId: isPopulatedItem ? item._id.toString() : claim.item_id?.toString(),
    claimantId: isPopulatedClaimant ? claimant._id.toString() : claim.user_id?.toString(),
    status: claim.status,
    claimMessage: claim.message,
    hasPrivateEvidence: Boolean(claim.evidence),
    createdAt: claim.created_at,
    updatedAt: claim.updated_at,
    item: isPopulatedItem
      ? {
          itemId: item._id.toString(),
          title: item.title,
          reportType: item.type,
          categoryName: item.category_id?.name ?? null,
        }
      : null,
    claimant: isPopulatedClaimant
      ? { fullName: claimant.full_name, email: includePrivate ? claimant.email : null }
      : null,
    review: claim.reviewed_at
      ? {
          reviewedAt: claim.reviewed_at,
          reviewerName: claim.reviewed_by?.full_name ?? null,
          reviewReason: claim.review_reason ?? null,
        }
      : null,
  };
  if (includePrivate && isPopulatedItem) {
    mapped.itemVerificationHint = item.verification_hint ?? null;
  }
  return mapped;
}

function populateClaim(query) {
  return query
    .populate({
      path: 'item_id',
      populate: { path: 'category_id', select: 'name' },
    })
    .populate('user_id', 'full_name email')
    .populate('reviewed_by', 'full_name');
}

export async function submitClaim(itemId, data, user) {
  const item = await Item.findById(itemId);
  if (!item || item.deleted_at) throw notFound('Item not found');
  if (item.type !== 'found') throw badRequest('Only found-item reports can be claimed.');
  if (item.user_id.toString() === user.userId)
    throw badRequest('You cannot claim your own report.');
  if (!['open', 'matched', 'claimed'].includes(item.status)) {
    throw conflict('This report is not accepting claims.');
  }

  const existing = await Claim.findOne({
    item_id: itemId,
    user_id: user.userId,
    status: 'pending',
  });
  if (existing) throw conflict('You already have a pending claim for this report.');
  const claim = await Claim.create({
    item_id: itemId,
    user_id: user.userId,
    message: data.claimMessage,
    evidence: data.privateEvidence || undefined,
  });
  await Promise.all([
    auditService.logSystemAction({
      action: 'claim.submitted',
      entityType: 'claim',
      entityId: claim._id.toString(),
      actorUserId: user.userId,
    }),
    notificationService.createNotification({
      user_id: item.user_id,
      type: 'claim',
      title: 'A new claim was submitted',
      content: `A user submitted a claim for "${item.title}".`,
      reference_id: claim._id,
      reference_type: 'claim',
    }),
  ]);
  return mapClaim(claim);
}

export async function listMyClaims(userId, params) {
  const query = { user_id: userId };
  if (params.status) query.status = params.status;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  const [total, claims] = await Promise.all([
    Claim.countDocuments(query),
    populateClaim(Claim.find(query)).sort({ created_at: -1 }).skip(offset).limit(limit),
  ]);
  return {
    rows: claims.map((claim) => mapClaim(claim)),
    meta: { page, limit, total },
  };
}

export async function listClaimQueue(params) {
  const query = {};
  if (params.status) query.status = params.status;
  else if (!params.includeDecided) query.status = 'pending';
  if (params.itemId) query.item_id = params.itemId;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  const [total, claims] = await Promise.all([
    Claim.countDocuments(query),
    populateClaim(Claim.find(query)).sort({ created_at: -1 }).skip(offset).limit(limit),
  ]);
  return {
    rows: claims.map((claim) => mapClaim(claim, true)),
    meta: { page, limit, total },
  };
}

export async function getClaimForReview(claimId) {
  const claim = await populateClaim(Claim.findById(claimId));
  return claim ? mapClaim(claim, true) : null;
}

export async function decideClaim(claimId, data, user) {
  if (user.role !== 'admin') throw forbidden('Administrator access required.');
  const claim = await Claim.findOne({ _id: claimId, status: 'pending' });
  if (!claim) {
    if (!(await Claim.exists({ _id: claimId }))) throw notFound('Claim not found');
    throw conflict('This claim has already been decided.');
  }

  if (data.decision === 'approved') {
    const item = await Item.findOneAndUpdate(
      { _id: claim.item_id, status: { $in: ['open', 'matched', 'claimed'] }, deleted_at: null },
      { $set: { status: 'returned', closed_at: new Date() } },
      { new: true }
    );
    if (!item) throw conflict('The report is no longer available for approval.');

    await Claim.updateMany(
      { item_id: claim.item_id, _id: { $ne: claim._id }, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          review_reason: 'Another claim was approved.',
          reviewed_by: user.userId,
          reviewed_at: new Date(),
        },
      }
    );
    await Match.updateMany(
      {
        $or: [{ item1_id: item._id }, { item2_id: item._id }],
        status: 'suggested',
      },
      { $set: { status: 'resolved' } }
    );
  }

  claim.status = data.decision;
  claim.review_reason = data.reviewReason ?? undefined;
  claim.reviewed_by = user.userId;
  claim.reviewed_at = new Date();
  await claim.save();

  await Promise.all([
    auditService.logSystemAction({
      action: `claim.${data.decision}`,
      entityType: 'claim',
      entityId: claim._id.toString(),
      actorUserId: user.userId,
      newState: { reviewReason: data.reviewReason ?? null },
    }),
    notificationService.createNotification({
      user_id: claim.user_id,
      type: 'claim',
      title: `Your claim was ${data.decision}`,
      content: data.reviewReason || `Your claim for report ${claim.item_id} was ${data.decision}.`,
      reference_id: claim._id,
      reference_type: 'claim',
    }),
  ]);
  return mapClaim(await populateClaim(Claim.findById(claim._id)), true);
}

export async function withdrawClaim(claimId, user) {
  const claim = await Claim.findById(claimId);
  if (!claim) throw notFound('Claim not found');
  if (claim.user_id.toString() !== user.userId)
    throw forbidden('You cannot withdraw another user’s claim.');
  if (claim.status !== 'pending') throw conflict('Only pending claims can be withdrawn.');
  claim.status = 'withdrawn';
  await claim.save();
  await auditService.logSystemAction({
    action: 'claim.withdrawn',
    entityType: 'claim',
    entityId: claim._id.toString(),
    actorUserId: user.userId,
  });
  return mapClaim(claim);
}

export default {
  submitClaim,
  listMyClaims,
  listClaimQueue,
  getClaimForReview,
  decideClaim,
  withdrawClaim,
};
