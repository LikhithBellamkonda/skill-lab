import { notFound, forbidden } from '../../utils/httpError.js';
import Item from '../../models/Item.js';
export function requireItemAccess(requireOwner = false) {
  return async (req, res, next) => {
    try {
      const itemId = req.params.itemId || req.params.id;
      const item = await Item.findById(itemId);
      if (!item) throw notFound('The item could not be found.');
      req.item = item;
      const isOwner = req.user.userId === item.user_id.toString();
      const isAdmin = req.user.role === 'admin';
      if (requireOwner) {
        if (!isOwner) throw forbidden('You do not have permission to modify this item.');
      } else {
        if (!isOwner && !isAdmin) throw forbidden('You do not have permission to modify this item.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
