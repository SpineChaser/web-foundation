# TicketHub Design

TicketHub sells tickets for concerts and events. Its hard problem is the "big sale": thousands of people try to buy the same few seats at once.

## 1. Requirements

Functional: browse events, view a seat map, hold seats for 5 minutes, pay, and view my tickets.

Non-functional:
- Correctness: a seat is never sold twice. This matters more than speed.
- Fairness: buyers are served first come, first served.
- Speed: browsing under 300 ms, a seat hold under 1 second.
- Reliability: 99.9% available, and nobody is charged without getting a ticket.

## 2. Estimates

Assumptions: 86,400 seconds a day, peak is 5 times the average, and in the big sale each of 200,000 people views 10 pages and tries for seats once in 600 seconds.

| | Normal day | Big sale |
|---|---|---|
| Page views per second | 50,000 x 10 / 86,400 = about 6 (30 at peak) | 200,000 x 10 / 600 = about 3,300 |
| Seat attempts per second | 5,000 / 86,400 = about 0.06 (0.3 at peak) | 200,000 / 600 = about 330 |

The big sale has about 550 times the reads and 5,500 times the seat attempts, and 90% of attempts must fail because only 20,000 seats exist. A normal day needs one server and one database, so the big sale is the problem.

## 3. API

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/events?q=rock&page=1` | Search and list events. | 200 |
| GET | `/events/{id}/seats` | Seat map with each seat's status. | 200 |
| POST | `/events/{id}/holds` | Hold seats for 5 minutes. | 201 |
| POST | `/orders` | Pay for my held seats. | 201 |
| GET | `/orders` | List my orders and tickets. | 200 |

Example: `POST /events/5/holds` with `{ "seatIds": [12, 13] }` returns 409 if seat 13 was just taken. Other errors: 400, 401, 404 and 429 (too many requests).

## 4. Data model

```
users(id, email UNIQUE, name)
events(id, title, venue, starts_at)
orders(id, user_id, total_cents, status, payment_key UNIQUE)
seats(id, event_id, label, price_cents, status, held_by, held_until, order_id)
```

Every `id` is a primary key, and `user_id`, `event_id`, `held_by` and `order_id` are foreign keys. Seat `status` is `available`, `held` or `sold`. Order `status` is `pending`, `paid` or `failed`. One user has many orders, one event has many seats, and one order has many seats. Each seat is in at most one order.

## 5. How double booking is prevented

Two people click the same seat at the same moment. The database decides, not the app.

1. **Hold with one atomic update.**

```sql
UPDATE seats
SET status = 'held', held_by = 7, held_until = datetime('now', '+5 minutes')
WHERE id = 13
  AND (status = 'available' OR (status = 'held' AND held_until < datetime('now')));
```

The check and the change are one statement and the database changes one row at a time, so only one of two simultaneous updates matches. The winner sees 1 row changed. The loser sees 0 and gets a 409.

2. **Pay in three safe steps.**
- Transaction 1: create the order as `pending` with a unique `payment_key` and extend the hold to 10 minutes, only for seats still held by this user. If fewer rows changed than seats ordered, ROLLBACK.
- Charge the card, sending `payment_key` as an idempotency key so a retry never charges twice.
- Transaction 2: on success mark the order `paid` and the seats `sold`. On failure mark it `failed` and release the seats.

If the app crashes after the charge, a worker finds old `pending` orders, asks the payment provider about each `payment_key`, and finishes transaction 2.

## 6. Architecture

```
Client
  |
  +---> CDN (pages, images, CSS, JS)
  |
Waiting room (lets in a fixed number of buyers)
  |
Load balancer
  |          |          |
App 1      App 2      App 3
  |  \         |
  |   +--> Cache (event list, seat map)
  |              |
  |         DB read replica <--copies-- DB primary
  |                                        ^
  +---- holds and orders (writes) ---------+
  |
  +--> Queue --> Worker (emails, expired holds, pending orders)
  |
  +--> Payment provider
```

- **Client:** the browser or phone app people buy from.
- **CDN:** serves pages and images near the user, so most browsing skips our servers.
- **Waiting room:** admits buyers first come, first served, a fixed number at a time, so the database never sees all 200,000 at once.
- **Load balancer:** spreads requests over the app servers and skips any that are down.
- **App servers:** run the API with no state, so we add more before a sale.
- **Cache:** holds the event list and seat map in memory, so most of the 3,300 reads a second skip the database.
- **DB primary:** the one place that decides who gets each seat and takes all writes.
- **Read replica:** a live copy that serves reads and can replace the primary if it fails.
- **Queue and worker:** do slow jobs: emails, freeing expired holds, settling pending orders.
- **Payment provider:** charges cards and remembers each `payment_key`, so repeats are safe.

**Surviving the big sale:** we add app servers beforehand, the CDN and cache absorb the reads, the waiting room turns a spike into a steady flow, and only seat writes reach the primary. **No single point of failure:** several app servers, two load balancers, a replica ready to be promoted, and a cache that falls back to the database.

## 7. Trade-offs

- **Waiting room:** it keeps the sale fair and protects the system, but some people wait. Without it the site would likely fail for all.
- **One primary for seat writes:** one decider keeps correctness simple, but it is a bottleneck and a single point of failure. The waiting room limits its load and a replica can take over.
- **Cached seat map:** fast, but a taken seat can look free for a few seconds, so some users get a 409. Correctness never depends on the cache, because the database decides.
- **Pending orders:** a worker must settle crashed payments, but nobody is charged without a ticket.
