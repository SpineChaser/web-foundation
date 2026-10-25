# TicketHub: Event Ticketing System Design

## 1. Requirements

### Functional requirements

1. Visitors can browse and search events by name, date, venue, or category.
2. Visitors can view event details, prices, seat maps, and current seat availability.
3. Registered users can sign in and request a temporary hold on available seats.
4. A seat hold expires after a defined period (for example, five minutes) if payment is not completed.
5. Users can pay for an order and receive a confirmed ticket after successful payment.
6. Users can view their orders and tickets, including ticket status.
7. The system releases expired holds and handles failed payments and cancellations.
8. Administrators can create events, configure seats and prices, and monitor sales.

### Non-functional requirements

- **Speed:** Aim for p95 below 300 ms for cached event browsing and below 500 ms for normal API reads, excluding external payment-provider delays.
- **Correctness:** A physical seat must never be confirmed for two different orders. Payment callbacks must be idempotent so repeated callbacks do not create duplicate tickets or process the same payment twice.
- **Fairness:** A server-side waiting room and rate limits control popular sales. Queue rules are transparent; repeated refreshes must not move a user ahead. Apply the same admission rules to customers in the same queue and limit automated buying.
- **Availability:** Browsing should remain available during a sale even if checkout is queued or slowed.
- **Scalability:** Add stateless application instances as traffic increases.
- **Security and privacy:** Use TLS, secure password hashes, authentication and authorization, and never store raw payment-card details.
- **Reliability:** Monitor latency, errors, queue depth, database health, and payment failures. Record order/payment events and alert operators.

## 2. Traffic and capacity estimates

### Normal day

Given 2,000,000 registered users, 50,000 daily visitors, 10 pages viewed per visitor, and 5,000 tickets sold per day:

- Page views per day = `50,000 × 10 = 500,000`.
- Average page views per second = `500,000 ÷ 86,400 ≈ 5.8`.
- If a busy period is five times the daily average, plan for about `5.8 × 5 ≈ 29 page views/second`.
- Average ticket sales = `5,000 ÷ 86,400 ≈ 0.058 tickets/second`, though actual sales are unevenly distributed.

### Popular concert sale

200,000 people try to buy 20,000 seats in 10 minutes (600 seconds):

- Purchase attempts per second = `200,000 ÷ 600 ≈ 333`.
- Demand is 10 times seat capacity; if each person buys one seat, only 10% can obtain a seat.
- For planning only, assume each person generates three page/API requests per minute while browsing or checking seats: `200,000 × 3 ÷ 60 ≈ 10,000 requests/second`. This is an assumption; real traffic depends on the user interface, polling, retries, and queue design.

### Comparison and response

Normal browsing averages about **5.8 page views/second** (illustrative busy period: **29/second**). The popular sale creates about **333 purchase attempts/second** and could produce roughly **10,000 requests/second** under the stated planning assumption. The purchase-attempt rate is about 5,700 times the normal average ticket-sale rate of 0.058 per second.

Cache public event details and static assets, use a waiting room and rate limits, scale stateless app servers horizontally, and keep seat allocation authoritative in the transactional database. Never use a cache as the final decision-maker for seat ownership.

## 3. API design

Use HTTPS and a versioned REST API under `/api/v1`. JSON is used for request and response bodies. Authenticated endpoints require a bearer token.

| Method and endpoint | Purpose | Success |
|---|---|---|
| `GET /api/v1/events` | Search/list events with date and pagination filters | `200 OK` |
| `GET /api/v1/events/{eventId}` | Get event details and prices | `200 OK` |
| `GET /api/v1/events/{eventId}/seats` | Get seat map and current availability | `200 OK` |
| `POST /api/v1/holds` | Temporarily hold selected seats | `201 Created` |
| `GET /api/v1/holds/{holdId}` | Check hold status and expiry | `200 OK` |
| `POST /api/v1/orders` | Create an order from a valid hold | `201 Created` |
| `POST /api/v1/orders/{orderId}/payment` | Start payment for a pending order | `202 Accepted` |
| `GET /api/v1/me/tickets` | List the signed-in user's confirmed tickets | `200 OK` |
| `POST /api/v1/payment-webhooks/provider` | Receive a signed payment result | `200 OK` |

### Example: hold seats

Request:

```json
{
  "eventId": "evt_204",
  "seatIds": ["seat_A12", "seat_A13"],
  "idempotencyKey": "hold-8e5f2a"
}
```

Response:

```json
{
  "holdId": "hold_731",
  "eventId": "evt_204",
  "seatIds": ["seat_A12", "seat_A13"],
  "status": "HELD",
  "expiresAt": "2026-11-01T14:05:00Z"
}
```

If any requested seat is unavailable, reject the entire request with `409 Conflict` and do not partially hold the group.

### Example: create an order

Request:

```json
{
  "holdId": "hold_731",
  "idempotencyKey": "order-41d9a0"
}
```

Response:

```json
{
  "orderId": "ord_992",
  "status": "PENDING_PAYMENT",
  "amount": 6000,
  "currency": "KES"
}
```

The server calculates the price from the database; it must not trust a price supplied by the browser.

### Errors

Use a consistent response:

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "One or more selected seats are no longer available."
  }
}
```

Use `400 Bad Request` for invalid input, `401 Unauthorized` for missing/invalid authentication, `403 Forbidden` for disallowed actions, `404 Not Found` for missing resources, `409 Conflict` for unavailable seats or expired holds, `429 Too Many Requests` for rate limits, and `500 Internal Server Error` for unexpected failures.

## 4. Data model

Use PostgreSQL because orders, holds, payments, and seat allocation require transactions and constraints.

### Tables and relationships

- **users:** One user can place many orders.
- **events:** One event has many seats and many orders.
- **seats:** Each seat belongs to one event and has a price.
- **orders:** Each order belongs to one user and one event; statuses include `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, and `EXPIRED`.
- **order_seats:** Join table linking orders to seats. It records `HELD`, `CONFIRMED`, `RELEASED`, or `EXPIRED` status and the hold expiry.
- **payments:** Records payment attempts and provider references. Provider references must be unique.

### PostgreSQL schema

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    venue TEXT NOT NULL,
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
    UNIQUE (event_id, section, row_label, seat_number),
    UNIQUE (event_id, id)
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_id BIGINT NOT NULL REFERENCES events(id),
    status TEXT NOT NULL CHECK (
        status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED')
    ),
    idempotency_key TEXT NOT NULL,
    total_kes BIGINT NOT NULL CHECK (total_kes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, idempotency_key),
    UNIQUE (id, event_id)
);

CREATE TABLE order_seats (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    seat_id BIGINT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED')
    ),
    hold_expires_at TIMESTAMPTZ,
    FOREIGN KEY (order_id, event_id) REFERENCES orders(id, event_id),
    FOREIGN KEY (event_id, seat_id) REFERENCES seats(event_id, id)
);

CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    provider_reference TEXT UNIQUE,
    status TEXT NOT NULL CHECK (
        status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')
    ),
    amount_kes BIGINT NOT NULL CHECK (amount_kes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Enforce at most one active allocation per seat with a partial unique index:

```sql
CREATE UNIQUE INDEX one_active_allocation_per_seat
ON order_seats (event_id, seat_id)
WHERE status IN ('HELD', 'CONFIRMED');
```

The application must change expired allocations to `EXPIRED` or `RELEASED` before creating a new active allocation. A worker helps release expired holds, but the hold transaction must also check expiry safely rather than depending only on the worker running on time.

### Example SQL queries

Find upcoming events:

```sql
SELECT id, name, venue, starts_at
FROM events
WHERE status = 'ON_SALE' AND starts_at > NOW()
ORDER BY starts_at;
```

List a user's confirmed tickets:

```sql
SELECT o.id AS order_id, e.name AS event_name,
       s.section, s.row_label, s.seat_number
FROM orders o
JOIN events e ON e.id = o.event_id
JOIN order_seats os ON os.order_id = o.id
JOIN seats s ON s.id = os.seat_id AND s.event_id = os.event_id
WHERE o.user_id = $1
  AND o.status = 'CONFIRMED'
  AND os.status = 'CONFIRMED';
```

Count confirmed seats by event:

```sql
SELECT e.id, e.name, COUNT(os.id) AS confirmed_seats
FROM events e
LEFT JOIN order_seats os
  ON os.event_id = e.id AND os.status = 'CONFIRMED'
GROUP BY e.id, e.name;
```

Find expired holds to process:

```sql
SELECT id, order_id, event_id, seat_id
FROM order_seats
WHERE status = 'HELD' AND hold_expires_at <= NOW();
```

In production, workers should claim rows safely (for example, using `FOR UPDATE SKIP LOCKED`) so multiple workers can operate without processing the same row at once.

### Preventing double-booking

1. The hold endpoint starts a database transaction.
2. It locks the requested seat rows using `SELECT ... FOR UPDATE`, in a consistent order such as ascending seat ID. Concurrent requests for the same seat must wait.
3. Within the transaction, it verifies the event is on sale and checks for an unexpired hold or confirmed allocation. Expired allocations are marked expired/released before a new hold is attempted.
4. It inserts the order and all requested seat allocations in the same transaction.
5. The partial unique index is the database-level safety net: two active allocations for one seat cannot both commit. If any seat is unavailable, roll back the whole transaction so a group request is not partially held.
6. Only a verified successful payment callback can confirm the order. Verify webhook signatures and process callbacks idempotently; unique idempotency keys and provider references prevent duplicate processing.
7. A hold expires after a clear time limit. Checkout must recheck expiry and order status transactionally before confirmation.

The database is the final authority. Checking availability only in JavaScript or in a potentially stale cache cannot prevent double-booking.

## 5. Architecture

### Architecture diagram

```text
                 +---------------------------+
                 | Web / mobile customers    |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 | DNS                       |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 | CDN: static assets/images |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 | Waiting room + rate limit |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 | Load balancer             |
                 +-------------+-------------+
                               |
                    +----------+----------+
                    |                     |
                    v                     v
             +--------------+      +--------------+
             | API server 1 |      | API server 2 |
             | stateless    |      | stateless    |
             +------+-------+      +-------+------+
                    |                      |
                    +----------+-----------+
                               |
                  +------------+-------------+
                  |                          |
                  v                          v
          +---------------+          +-------------------+
          | Redis cache   |          | Primary PostgreSQL|
          | public events |          | seats/orders/pay  |
          +---------------+          +---------+---------+
                                               |
                                               v
                                      +-------------------+
                                      | Read replica      |
                                      | browse/reporting  |
                                      +-------------------+

          +---------------------+      +-------------------+
          | Durable message     |----->| Background workers|
          | queue               |      | expire holds/email|
          +---------------------+      +-------------------+

          +---------------------+
          | Payment provider    |
          | signed webhooks     |
          +---------------------+
```

### Component explanations

- **Web/mobile client:** Displays events, seat maps, queue status, checkout, and tickets. It never decides who owns a seat.
- **DNS:** Routes the domain name to the service entry point.
- **CDN:** Serves static assets and images close to users, reducing origin traffic.
- **Waiting room and rate limiter:** Controls admission during popular sales, reduces bot abuse, and prevents all visitors from reaching checkout at once.
- **Load balancer:** Distributes requests among healthy app servers and stops sending traffic to unhealthy instances.
- **Stateless API servers:** Validate requests, enforce authorization, and run business logic. More instances can be added during a sale.
- **Redis cache:** Speeds up public event reads and may store queue metadata. It is not the source of truth for seat ownership.
- **Primary PostgreSQL database:** Stores authoritative seat allocations, orders, and payments; transactions and constraints prevent conflicting allocations.
- **Read replica:** Serves suitable browsing and reporting reads, reducing pressure on the primary. Checkout must revalidate seats on the primary.
- **Durable message queue:** Buffers retryable work such as emails and ticket delivery so it does not slow checkout.
- **Background workers:** Process queued tasks and expired holds. They must be idempotent and check database state before changing it.
- **Payment provider:** Processes payments; signed callbacks report results and are verified before an order is confirmed.

### `GET /api/v1/events` request flow

1. The client request enters through DNS and the CDN; the load balancer routes dynamic API traffic to a healthy app server.
2. The app checks Redis for cached event information.
3. On a cache miss, the app reads from PostgreSQL or a suitable read replica and caches the result briefly.
4. The app returns JSON. Seat availability shown to the user is informational and may change before checkout.

### `POST /api/v1/holds` request flow

1. The customer passes through the waiting room and sends an authenticated request with seat IDs and an idempotency key.
2. The app server validates the user, event status, request, and queue admission.
3. It begins a transaction on the primary database and locks requested seat rows in a consistent order.
4. It checks active allocations and expiry, then inserts the order and seat holds.
5. The database unique index prevents two active allocations for one seat. If a seat is unavailable, the transaction rolls back and the API returns `409 Conflict`.
6. After commit, the API returns a hold ID and expiry. The user must pay before the hold expires.
7. The payment provider sends a signed result. The app verifies and processes it idempotently in a transaction; ticket and email tasks are queued after commit.

### Surviving the popular sale

- Use the waiting room to limit how many users reach checkout at once.
- Cache event descriptions and static assets, but always use the primary database for seat allocation.
- Scale stateless app servers horizontally and use health checks.
- Keep transactions short, lock only requested seats, and lock multi-seat requests in a consistent order to reduce deadlocks.
- Rate-limit seat polling and encourage backoff instead of repeated refreshes.
- Send emails and ticket delivery to a durable queue with retries.
- Monitor queue depth, latency, database connections, lock conflicts, and payment failures.
- Use database backups, replication, tested recovery procedures, and app instances across failure domains. A read replica alone does not guarantee automatic failover.

## 6. Trade-offs

### Strong consistency versus speed

Using primary-database transactions and a unique constraint makes seat allocation safer than trusting a cache, but it can increase latency and contention during a sale. TicketHub prioritizes correctness for holds and confirmations while caching event browsing.

### Waiting-room fairness versus immediate access

A waiting room protects checkout and provides orderly admission, but some customers must wait even if the system could serve a few more requests immediately. Queue rules should be transparent, consistent, and resistant to refresh-based queue jumping.

### Temporary holds versus seat utilization

Holds give customers time to pay, but abandoned holds temporarily block seats. Short expiry improves availability but may frustrate slow payers; long expiry wastes inventory. TicketHub uses a clear countdown and reliable expiry processing.

### Asynchronous work versus immediate delivery

Queues keep email and ticket delivery from slowing checkout, but messages may arrive after an order is confirmed. The database order status remains authoritative, and workers retry failures without creating duplicate tickets.

## Conclusion

TicketHub separates high-volume browsing from seat allocation and checkout. Caching and a waiting room help absorb the sale spike, while transactions, row locks, idempotency, and a database uniqueness constraint prevent two customers from owning the same seat. Seat ownership must be decided by the authoritative database, not by the browser or a stale cache.
