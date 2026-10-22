# Day 7: SnapShare Scaling Plan

## 1. System Overview and Assumptions

SnapShare is a photo-sharing application. Users upload photos, follow other users, and view photos through a personalized feed. The purpose of this plan is to estimate the system's expected workload and design an architecture that can handle growth.

The calculations use these assumptions:

- Registered users: 10,000,000.
- Daily active users (DAU): 10% of registered users.
- Upload activity: one photo per active user per day.
- Feed activity: 50 feed-page views per active user per day.
- Average original photo size: 2 MB.
- Average thumbnail size: 50 KB per photo.
- Seconds per day: 86,400.
- Days per year: 365.
- Peak feed traffic: five times average traffic.
- Storage retention: original photos and thumbnails are kept for at least one year.
- Storage units: decimal units are used, where 1 GB = 1,000 MB and 1 TB = 1,000 GB.

The estimates represent average daily activity and a calculated feed-traffic peak. Actual production traffic may vary.

## 2. Workload Calculations

### 2.1 Daily Active Users (DAU)

Daily active users are 10% of the registered user base.

Calculation:

10,000,000 × 10 ÷ 100 = **1,000,000 DAU**

SnapShare is therefore planned for approximately one million active users per day.

### 2.2 Photo Uploads Per Second

Each active user uploads one photo per day.

**Daily uploads:**

1,000,000 users × 1 photo = 1,000,000 uploads/day

**Average uploads per second:**

1,000,000 ÷ 86,400 = 11.574

**Result: approximately 11.57 photo uploads per second**, or about 12 uploads per second on average.

This is an average, not a maximum. Upload requests may arrive in bursts, so the application must be able to distribute requests across multiple servers.

### 2.3 Feed Views Per Second

Each active user views 50 feed pages per day.

**Daily feed views:**

1,000,000 users × 50 views = 50,000,000 feed views/day

**Average feed views per second:**

50,000,000 ÷ 86,400 = 578.704

**Peak feed views per second:**

578.704 × 5 = 2,893.52

| Feed traffic measurement | Estimated rate |
|---|---:|
| Daily feed views | 50,000,000 |
| Average feed views per second | 578.70 |
| Peak multiplier | 5× |
| Peak feed views per second | 2,893.52 |

SnapShare should plan for approximately 579 average feed views per second and 2,894 peak feed views per second. These figures count feed-page requests, not individual image downloads.

### 2.4 Storage Required Per Year

Original photo storage:

- Per day: 1,000,000 × 2 MB = 2,000,000 MB = 2,000 GB = 2 TB.
- Per year: 2 TB × 365 = **730 TB/year**.

Thumbnail storage:

- Per day: 1,000,000 × 50 KB = 50,000,000 KB = 50 GB.
- Per year: 50 GB × 365 = 18,250 GB = **18.25 TB/year**.

Total new photo storage per year:

730 TB + 18.25 TB = **748.25 TB/year**.

This estimate includes the original photos and one thumbnail per photo. It excludes backups, replicas, database metadata, logs, and storage overhead. If SnapShare keeps older photos, the total storage used by the platform will accumulate over multiple years.

## 3. Read-Heavy or Write-Heavy?

SnapShare is a **read-heavy system** under the given assumptions.

Each active user views 50 feed pages but uploads only one photo per day. This creates a ratio of 50 feed views to every photo upload. The design should therefore give particular attention to fast feed retrieval and image delivery.

The architecture addresses this by using a cache for frequently requested data, a database read replica for suitable read queries, and a content delivery network (CDN) for photo delivery. Multiple app servers can handle incoming requests, while a queue and worker process thumbnail jobs outside the main upload request.

## 4. Photo Storage Decision: Object Storage or Database?

SnapShare should store original photo files and thumbnails in **object storage**, not as large binary files inside the relational database.

Photo files consume substantial storage space. Keeping them in the database would increase its size and make backups, restoration, and routine database operations more demanding. Object storage is designed to store large numbers of files and can scale independently as the photo collection grows.

The relational database should store photo metadata, including the photo ID, owner ID, caption, upload timestamp, original-file key, thumbnail key, and processing status. This allows the application to search and manage photo records without loading the actual image bytes into the database.

The CDN can cache and deliver images close to users, while object storage remains the durable origin for the files.

## 5. Text-Based Architecture Diagram

The following diagram includes the load balancer, app servers, cache, primary database, database read replica, object storage, queue, thumbnail worker, and CDN.

```text
                         +------------------+
                         |   SNAPSHARE      |
                         |      USERS       |
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         |  LOAD BALANCER   |
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         |   APP SERVERS    |
                         | Auth, Feed, APIs |
                         +---+----+----+----+
                             |    |    |
                  +----------+    |    +----------------+
                  |               |                     |
                  v               v                     v
           +-------------+ +-------------+       +-------------+
           |    CACHE    | |   PRIMARY   |       |    QUEUE    |
           | Feed Data   | |  DATABASE   |       | Thumbnail   |
           +-------------+ |  Metadata   |       |    Jobs     |
                           +------+------+       +------+------+
                                  |                     |
                                  v                     v
                           +-------------+       +-------------+
                           | READ REPLICA|       | THUMBNAIL   |
                           | Read Queries|       |   WORKER    |
                           +-------------+       +------+------+
                                                       |
                                                       v
                                                +-------------+
                                                |    OBJECT   |
                                                |   STORAGE   |
                                                | Originals + |
                                                | Thumbnails  |
                                                +------+------+
                                                       |
                                                       v
                                                +-------------+
                                                |     CDN     |
                                                | Image Cache |
                                                +-------------+

UPLOAD FLOW:
User -> Load Balancer -> App Servers
User -> Authorized upload URL -> Object Storage
App Servers -> Primary Database (photo metadata)
App Servers -> Queue -> Thumbnail Worker -> Object Storage

FEED FLOW:
User -> Load Balancer -> App Servers -> Cache
                                  -> Read Replica if needed
User -> CDN -> Cached image
             -> Object Storage if image is not cached
```

## 6. Purpose of Each Architecture Component

1. **Load balancer:** Distributes incoming application requests among healthy app servers so that one server does not become overloaded.

2. **App servers:** Handle authentication, permissions, feed requests, upload coordination, and communication with the database and other services.

3. **Cache:** Stores frequently requested feed data or metadata temporarily so that repeated requests can be served faster with fewer database queries.

4. **Primary database:** Stores the authoritative records for users, follows, photo metadata, captions, visibility settings, and upload status.

5. **Database read replica:** Serves suitable read queries to reduce the read workload on the primary database, although replication delay can mean some recent changes are not immediately visible.

6. **Object storage:** Stores original photos and generated thumbnails separately from the database and accommodates the platform's growing collection of image files.

7. **Queue:** Holds thumbnail-generation jobs until a worker can process them, allowing the upload request to finish without waiting for thumbnail creation.

8. **Thumbnail worker:** Retrieves jobs from the queue, reads original images from object storage, generates thumbnails, and saves the results to object storage.

9. **CDN (content delivery network):** Caches and delivers photos from locations closer to users, reducing image-loading latency and repeated requests to the origin storage.

The cache handles repeated application data requests, the read replica handles database reads, and the CDN handles image delivery; they solve different performance problems.

## 7. Photo Upload Flow: Step by Step

1. **User starts an upload:** The user selects a photo and submits it through the SnapShare application.

2. **Application validation:** An app server authenticates the user and checks permissions, file type, and file size.

3. **Upload authorization:** The application generates or coordinates a short-lived, authorized upload URL for object storage.

4. **Original photo upload:** The user's device sends the original image directly to object storage through the authorized URL, reducing the need to stream the entire file through an app server.

5. **Metadata recording:** After the original upload succeeds, the application records the photo ID, owner, timestamp, object-storage key, and status in the primary database.

6. **Job creation:** The application adds a thumbnail-generation task to the queue.

7. **Worker retrieves the task:** A thumbnail worker reads the queued job and retrieves the original photo from object storage.

8. **Thumbnail generation:** The worker creates a smaller image targeting the assumed average thumbnail size of 50 KB.

9. **Thumbnail storage and status update:** The worker saves the thumbnail in object storage and updates the database with its storage key and processing status.

10. **Photo delivery:** The application makes the photo available to feed requests when its required metadata is ready. If thumbnail generation is still pending, the interface can show a placeholder. The CDN serves cached images or fetches them from object storage when they are not cached.

The queue separates thumbnail generation from the upload request. Failed jobs should be retried and monitored so that temporary worker failures do not permanently prevent thumbnail creation.

## 8. Architecture Trade-Offs

### Trade-off 1: Cache performance versus data freshness

A cache reduces repeated database queries and can make popular feeds load faster. However, cached data may be outdated after a user deletes a photo or changes their follow list. SnapShare must choose suitable cache expiration periods and invalidate important entries when changes occur.

### Trade-off 2: Read scaling versus consistency

A read replica allows more feed queries to run without placing all the read workload on the primary database. However, replication may lag behind recent writes. A user may not immediately see a newly uploaded photo if the application reads stale replica data. The application can use the primary database for important read-after-write requests and the replica for less time-sensitive queries.

### Trade-off 3: Fast uploads versus delayed thumbnails

A queue allows uploads to finish without waiting for thumbnail processing, improving the upload experience. However, a busy queue or failed worker can delay thumbnail availability. SnapShare needs job retries, monitoring, and a way to identify jobs that repeatedly fail.

### Trade-off 4: Scalable storage versus operating cost

Object storage and a CDN allow image delivery to scale without placing all file traffic on the application servers. However, storing hundreds of terabytes and serving large numbers of images costs money. SnapShare should monitor storage and bandwidth use, set appropriate caching policies, and define retention rules that fit its requirements.

## 9. Conclusion

Based on the stated assumptions, SnapShare has an estimated one million daily active users, 11.57 average photo uploads per second, 578.70 average feed views per second, and 2,893.52 peak feed views per second. New original photos and thumbnails require approximately 748.25 TB of storage per year.

The system is read-heavy, so the proposed design uses a cache, database read replica, and CDN to reduce pressure on the main application and database. Original photos are stored in object storage, while a queue and thumbnail worker handle image processing asynchronously. These components separate the main responsibilities and allow each part of the platform to scale as demand increases.
