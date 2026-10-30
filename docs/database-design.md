# MongoDB database design

MongoDB is the system of record. Mongoose schemas live in `server/src/models/`.
Collections are created when first written; there are no SQL migrations.

## Collections

| Collection      | Purpose and references                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `users`         | Normalized email, bcrypt hash, role, active state                                                                            |
| `categories`    | Unique category name and description                                                                                         |
| `items`         | Lost/found report, owner and category ObjectIds, optional GeoJSON Point, images, lifecycle status, private verification hint |
| `claims`        | Claimant and item ObjectIds, message, private evidence, review status/reason                                                 |
| `matches`       | Pair of item ObjectIds, score, status, candidate metadata                                                                    |
| `notifications` | Recipient ObjectId, message, read state, optional referenced record                                                          |
| `auditlogs`     | Append-oriented action record and optional actor ObjectId                                                                    |

## Indexes and constraints

- Unique user email and category name.
- `items.location` uses a `2dsphere` index for geographic radius filtering.
- Item listings and user-owned items have indexes on status/type, owner, and
  creation time.
- Claims are indexed by user and item/status. A partial unique index prevents
  duplicate pending claims by the same user for one item.
- Matches are indexed by item pair (unique) and status/score.
- Notifications are indexed by recipient, unread state, and creation time.

Mongoose creates indexes from the model declarations. For production, create
indexes during a controlled deployment and monitor index-build time on large
collections.

## Privacy

The API maps database documents to explicit response objects. Public item
responses omit `verification_hint`; only the report owner and an administrator
can see it. Claim `evidence` is never returned, including to administrators;
responses expose only whether evidence exists. Password hashes are excluded from
all API responses.

See [er-diagram.mmd](er-diagram.mmd) for collection relationships.
