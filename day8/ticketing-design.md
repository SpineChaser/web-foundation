# TicketHub - Design Document

## 1. Requirements

### Functional
- Browse/search events by name, city, date, or category.
- View event details, prices, seat maps, and availability.
- Sign in and hold available seats for 10 minutes while paying.
- Pay for an order, receive tickets after payment is verified, and view personal tickets.
- Release expired holds and handle failed payments safely.
- Authorized staff can create events, seats, prices, and sale windows.

### Non-functional
- **Correctness:** A seat must never be sold twice. The primary database—not the browser or cache—is authoritative for seat ownership.
- **Speed:** Normal event pages should load in under one second where practical. During a rush, provide clear queue or seat-conflict messages.
- **Scalability:** Handle an estimated 3,300 requests/second during a ten-minute sale using caching, a waiting room, and horizontally scaled app servers.
- **Fairness:** A virtual waiting room admits people in queue order. Refreshing must not improve position; apply rate limits and bot controls consistently.
- **Availability:** Browsing remains available even when checkout is queued or throttled.
- **Security:** Use HTTPS, secure password hashes, authentication/authorization, server-side prices, signed payment webhooks, and never store raw card details.
- **Reliability:** Use idempotency keys, durable background jobs, monitoring, backups, and tested recovery.

## 2. Estimates

### Normal day
- Page views/day = `50,000 visitors × 10 pages = 500,000`.
- Average = `500,000 ÷ 86,400 ≈ 5.8 page views/second`.
- If a busy period is five times the average, plan for about `29 page views/second`.
- Ticket sales average `5,000 ÷ 86,400 ≈ 0.058 tickets/second`; sales are not evenly distributed.

### Popular concert sale
- 200,000 people try to buy 20,000 seats in 10 minutes = 600 seconds.
- Assume each person makes around 10 requests while refreshing, selecting seats, and checking out.
- Requests = `200,000 × 10 = 2,000,000`.
- Rate = `2,000,000 ÷ 600 ≈ 3,333 requests/second`.
- Demand is 10 people per seat. At most 20,000 single-seat purchases succeed; at least 180,000 people cannot get a seat.

The estimated sale rate is about `3,333 ÷ 5.8 ≈ 575` times normal average page-view traffic. The request count is an assumption; actual traffic depends on page behavior and retries.

**Design response:** A virtual waiting room limits admission to checkout. A CDN/cache absorb public browsing, while every hold and purchase is verified by the primary database.

## 3. API design

Use HTTPS and JSON. Authenticated endpoints require a valid session or bearer token. The server calculates prices; it never trusts totals supplied by the client.

| Method and endpoint | Purpose | Success |
|---|---|---|
| `GET /events?search=&city=` | Search/list events | `200 OK` |
| `GET /events/{id}` | Event details | `200 OK` |
| `GET /events/{id}/seats` | Seat map and displayed availability | `200 OK` |
| `POST /holds` | Hold seats for 10 minutes | `201 Created` |
| `GET /holds/{id}` | Check hold and expiry | `200 OK` |
| `POST /orders` | Create order from a valid hold and start payment | `201 Created` or `202 Accepted` |
| `GET /me/tickets` | List signed-in user's confirmed tickets | `200 OK` |
| `POST /payments/webhook` | Receive verified payment result | `200 OK` |

### Hold request

`POST /holds`

```json
{
  "eventId": 7,
  "seatIds": [101, 102],
  "idempotencyKey": "hold-user42-9c12"
}
```

Example response:

```json
{
  "holdId": 55,
  "eventId": 7,
  "seatIds": [101, 102],
  "status": "HELD",
  "expiresAt": "2026-11-01T14:10:00Z"
}
```

If any requested seat is unavailable, return `409 Conflict` and do not create a partial hold.

### Order request

`POST /orders`

```json
{
  "holdId": 55,
  "paymentToken": "provider-token",
  "idempotencyKey": "order-user42-a71f"
}
```

Example response:

```json
{
  "orderId": 9001,
  "status": "PENDING_PAYMENT",
  "message": "Payment is being processed."
}
```

A verified payment-provider callback confirms the order; a browser message alone never proves payment succeeded.

### Error responses
- `400 Bad Request`: invalid input.
- `401 Unauthorized`: not signed in.
- `403 Forbidden`: action not allowed.
- `404 Not Found`: missing resource.
- `409 Conflict`: seat unavailable or hold expired.
- `429 Too Many Requests`: rate limit reached.
- `500 Internal Server Error`: unexpected error.

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "One or more selected seats are no longer available."
  }
}
```

Idempotency keys on hold/order/payment requests ensure retries return an existing result instead of creating duplicate orders or payments.

## 4. Data model

Use PostgreSQL because seat allocation and order/payment changes require transactions and strong constraints.

### Tables and relationships
- **users:** One user can have many orders (one-to-many).
- **events:** One event has many seats and orders (one-to-many).
- **seats:** Each seat belongs to one event; its unique position is event, section, row, and number.
- **orders:** Each order belongs to one user and one event.
- **order_seats:** Links orders to seats. An order can contain multiple seats; historical cancelled/expired records may remain.
- **payments:** An order may have payment attempts. Provider references and idempotency keys are unique.

### SQL schema

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    venue TEXT NOT NULL,
    city TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seats (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    section TEXT NOT NULL,
    row_label TEXT NOT NULL,
    seat_number TEXT NOT NULL,
    price_kes INTEGER NOT NULL CHECK (price_kes >= 0),
    status TEXT NOT NULL DEFAULT 'available'
      CHECK (status IN ('available', 'held', 'sold')),
    hold_id UUID,
    hold_expires_at TIMESTAMPTZ,
    UNIQUE (event_id, section, row_label, seat_number),
    UNIQUE (event_id, id)
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_id BIGINT NOT NULL REFERENCES events(id),
    total_kes BIGINT NOT NULL CHECK (total_kes >= 0),
    status TEXT NOT NULL CHECK (
      status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED')
    ),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, idempotency_key),
    UNIQUE (id, event_id)
);

CREATE TABLE order_seats (
    order_id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    seat_id BIGINT NOT NULL,
    allocation_status TEXT NOT NULL CHECK (
      allocation_status IN ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED')
    ),
    PRIMARY KEY (order_id, seat_id),
    FOREIGN KEY (order_id, event_id) REFERENCES orders(id, event_id),
    FOREIGN KEY (event_id, seat_id) REFERENCES seats(event_id, id)
);

CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    provider_reference TEXT UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    amount_kes BIGINT NOT NULL CHECK (amount_kes >= 0),
    status TEXT NOT NULL CHECK (
      status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

For a clear database-level guarantee that a seat has at most one active allocation, use a separate table whose seat ID is the primary key:

```sql
CREATE TABLE active_seat_allocations (
    seat_id BIGINT PRIMARY KEY REFERENCES seats(id),
    order_id BIGINT NOT NULL REFERENCES orders(id),
    allocation_status TEXT NOT NULL CHECK (
      allocation_status IN ('HELD', 'CONFIRMED')
    ),
    hold_expires_at TIMESTAMPTZ
);
```

The `PRIMARY KEY (seat_id)` means two active allocations cannot use the same seat. On expiry/cancellation, delete the active allocation and update the seat/order state in the same transaction.

### Example SQL queries

Upcoming events:

```sql
SELECT id, name, venue, city, starts_at
FROM events
WHERE status = 'ON_SALE' AND starts_at > NOW()
ORDER BY starts_at;
```

Tickets for a user:

```sql
SELECT o.id AS order_id, e.name AS event_name,
       s.section, s.row_label, s.seat_number
FROM orders o
JOIN order_seats os ON os.order_id = o.id
JOIN events e ON e.id = o.event_id
JOIN seats s ON s.id = os.seat_id AND s.event_id = os.event_id
WHERE o.user_id = $1
  AND o.status = 'CONFIRMED'
  AND os.allocation_status = 'CONFIRMED';
```

Count sold seats by event:

```sql
SELECT e.id, e.name, COUNT(*) AS sold_seats
FROM events e
JOIN seats s ON s.event_id = e.id
WHERE s.status = 'sold'
GROUP BY e.id, e.name;
```

### Preventing double-booking

A hold is decided by the primary database. Use a transaction and lock seat rows with `SELECT ... FOR UPDATE`. Lock multiple seats in ascending ID order to reduce deadlocks.

```sql
BEGIN;

SELECT id, status, hold_expires_at
FROM seats
WHERE event_id = 7 AND id IN (101, 102)
ORDER BY id
FOR UPDATE;

UPDATE seats
SET status = 'held',
    hold_id = '00000000-0000-4000-8000-000000000055',
    hold_expires_at = NOW() + INTERVAL '10 minutes'
WHERE event_id = 7
  AND id IN (101, 102)
  AND (
    status = 'available'
    OR (status = 'held' AND hold_expires_at < NOW())
  )
RETURNING id;

-- Application checks that exactly 2 rows were returned.
-- If fewer than 2: ROLLBACK and respond HTTP 409.
-- If both updated: insert order/active allocations and COMMIT.
COMMIT;
```

The application must check the number of returned rows; the comment alone does not enforce the rule. If fewer than the requested number of seats changed, roll back the whole transaction. Row locks serialize competing updates, and `active_seat_allocations.seat_id` as a primary key is a second database guard. Verify payment webhook signatures and process callbacks idempotently. Only verified successful payment confirms the order.

Expired holds are released by a background worker, but the hold transaction must also check expiry safely; it cannot rely only on a scheduled job running on time.

## 5. Architecture

### Architecture diagram

```text
+-----------------------+
| Browser / mobile app  |
+-----------+-----------+
            |
            v
+-----------------------+
| DNS                   |
+-----------+-----------+
            |
            v
+-----------------------+
| CDN: static assets    |
+-----------+-----------+
            |
            v
+-----------------------+
| Virtual waiting room  |
| queue + rate limiting |
+-----------+-----------+
            |
            v
+-----------------------+
| Load balancer         |
+-----------+-----------+
            |
       +----+----+
       |         |
       v         v
+-----------+ +-----------+
| App server| | App server|
| 1         | | 2         |
+-----+-----+ +-----+-----+
      |             |
      +------+------+ 
             |
      +------+--------------------+
      |                           |
      v                           v
+-------------+          +-------------------+
| Redis cache |          | Primary database  |
| event reads |          | seats/orders      |
+-------------+          +---------+---------+
                                   |
                                   v
                         +-------------------+
                         | Read replica      |
                         | browse/search     |
                         +-------------------+

+----------------------+       +----------------------+
| Durable message queue| ----> | Background workers   |
+----------------------+       | ticket emails/expiry |
                               +----------------------+

+----------------------+
| Payment provider     |
| signed webhooks      |
+----------------------+
```

### Component explanations
- **Browser/mobile:** Displays events, seat maps, queue status, checkout, and tickets; it never decides seat ownership.
- **DNS:** Routes the site name to the service.
- **CDN:** Serves shared images, CSS, JavaScript, and static files close to visitors.
- **Waiting room:** Admits customers at a controlled rate in arrival order and protects checkout from all 200,000 visitors arriving at once.
- **Load balancer:** Sends requests to healthy app servers.
- **Stateless app servers:** Validate authentication and business rules; scale horizontally before a known sale.
- **Redis cache:** Speeds up public event details and short-lived seat-map views. It is not authoritative; checkout rechecks the primary database.
- **Primary database:** Source of truth for seat status, holds, orders, and payments. Transactions and constraints prevent double-booking.
- **Read replica:** Handles browsing/search reads so the primary can focus on holds and orders. Final availability is rechecked on the primary.
- **Durable queue/workers:** Generate ticket PDFs, send emails, and release expired holds outside checkout. Workers retry safely.
- **Payment provider:** Processes payments and sends signed callbacks that the application verifies.

### `GET /events` flow
1. The request enters through DNS/CDN; dynamic API traffic is routed by the load balancer to a healthy app server.
2. The app checks Redis for event details.
3. On a cache miss, it reads from the database/read replica and caches the result briefly.
4. The app returns JSON. Displayed availability is a snapshot and may change before checkout.

### `POST /holds` flow
1. The user passes the waiting room and submits an authenticated request with seat IDs and an idempotency key.
2. The app validates the request and starts a transaction on the primary database.
3. It locks requested seat rows in a consistent order and checks availability/expiry.
4. It updates all requested seats and creates hold/order records in the same transaction.
5. If any seat cannot be held, it rolls back and returns `409 Conflict`. Otherwise it commits and returns the hold ID/expiry.
6. The user pays through the provider. A verified callback updates the order idempotently.
7. Ticket/email work is queued after confirmation.

### Surviving the ten-minute rush
- Waiting room limits concurrent checkout.
- CDN and Redis absorb public content reads.
- Horizontally scaled app servers handle admitted traffic.
- Short database transactions lock only requested seats.
- Rate limits reduce repeated refreshes.
- Queue moves email/PDF work away from checkout.
- Monitor queue depth, latency, database connections, lock waits, and payment errors.
- Multiple app instances, backups, replication, and tested recovery reduce single points of failure. A read replica alone is not a complete failover plan.

## 6. Trade-offs

1. **Correctness versus purchase availability:** Holds and purchases go to the primary database even if users must wait or retry. Selling a seat twice is worse than briefly rejecting a request.
2. **Freshness versus speed:** A cached seat map can be a few seconds old. A customer may see a seat as free and receive `409 Conflict`; the final database check remains correct.
3. **Fairness versus simplicity:** A waiting room adds complexity and wait time, but protects the service and prevents refreshers/bots from unfairly winning.
4. **Hold convenience versus seat utilization:** A ten-minute hold gives time to pay but blocks seats when customers abandon checkout. Expiry must be reliable and clearly shown.

## Conclusion

Seat ownership is decided by the primary database. The waiting room, CDN, cache, app servers, and queue help the system handle the rush; transactions, row locks, conditional updates, idempotency, and unique constraints protect correctness.
