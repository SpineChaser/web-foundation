# SnapShare: Photo App Scaling Plan

## 1. Introduction

SnapShare is a photo-sharing application where users upload photos and scroll through a feed containing photos from people they follow. This document estimates the system's workload and proposes an architecture that can support the expected traffic while keeping photo uploads and feed loading efficient.

## 2. Assumptions

The scaling estimates use the following assumptions:

- SnapShare has 10 million registered users.
- 10% of registered users are active each day.
- Every daily active user uploads one photo per day.
- Every daily active user views 50 feed pages per day.
- Each original photo is 2 MB.
- Each photo has one thumbnail of 50 KB.
- A day contains 86,400 seconds, and a year contains 365 days.
- MB, GB and TB use decimal units: 1 TB = 1,000 GB.
- Every uploaded photo and its thumbnail are retained for the full year.
- The storage estimate covers original photos and thumbnails only, excluding database records, backups, replicas, logs and other overhead.
- Peak feed traffic is estimated at five times the average rate.

These are planning estimates rather than measured production traffic. Actual traffic may vary by time of day and user activity.

## 3. Traffic and Storage Calculations

### 3.1 Daily Active Users

Daily active users are 10% of the 10 million registered users.

Calculation:

10,000,000 × 10% = 1,000,000 daily active users

Therefore, SnapShare has an estimated **1 million daily active users**.

### 3.2 Photo Uploads Per Second

Each daily active user uploads one photo per day.

Daily uploads:

1,000,000 × 1 = 1,000,000 uploads per day

Average uploads per second:

1,000,000 ÷ 86,400 = 11.57 uploads per second

SnapShare must therefore handle approximately **12 photo uploads per second on average**.

### 3.3 Feed Views Per Second

Each daily active user views 50 feed pages per day.

Daily feed views:

1,000,000 × 50 = 50,000,000 feed views per day

Average feed views per second:

50,000,000 ÷ 86,400 = 578.70 feed views per second

Peak feed views per second, using the required factor of five:

578.70 × 5 = 2,893.52 feed views per second

SnapShare should plan for approximately **579 average feed views per second and 2,894 peak feed views per second**.

### 3.4 Photo Storage Per Year

Each day, users upload one million original photos.

Original photo storage per day:

1,000,000 × 2 MB = 2,000,000 MB = 2 TB per day

Original photo storage per year:

2 TB × 365 = 730 TB per year

Each photo also produces one 50 KB thumbnail.

Thumbnail storage per day:

1,000,000 × 50 KB = 50 GB per day

Thumbnail storage per year:

50 GB × 365 = 18,250 GB = 18.25 TB per year

Total new photo storage per year:

730 TB + 18.25 TB = 748.25 TB per year

SnapShare therefore needs approximately **748.25 TB of additional object storage per year** for original photos and thumbnails, assuming all uploads are retained. This estimate does not include backups, replication, or existing photos from previous years.

## 4. Read-Heavy or Write-Heavy?

SnapShare is primarily a **read-heavy system** because users view 50 feed pages per day but upload only one photo per day. Based on the supplied assumptions, that is 50 feed views for every photo upload.

This means the architecture should prioritize fast feed loading, efficient image delivery, caching, and the ability to scale read traffic independently. App servers can be scaled horizontally, frequently requested data can be cached, and a database read replica can handle suitable read queries without sending every request to the primary database.

Photo uploads still need to be reliable, so the system must also support durable storage and asynchronous thumbnail generation.

## 5. Where Photos Should Be Stored

Original photos and thumbnails should be stored in object storage rather than directly inside the relational database.

Photo files are large binary objects, and storing them inside the database would increase database size, backup costs, and the amount of data the database must manage. This could make routine database operations and recovery slower.

Object storage is designed for large files and can scale to accommodate hundreds of terabytes of new photo data per year. The database should instead store metadata such as the photo ID, owner ID, caption, upload time, object-storage key, thumbnail key, and visibility settings.

A content delivery network (CDN) can then cache and deliver images from object storage closer to users, reducing repeated requests to the origin storage.

## 6. Proposed Architecture Diagram

The following text diagram shows how the main components work together.

```text
                         SNAPSHARE USERS
                                |
                 +--------------+--------------+
                 |                             |
             Uploads                      Feed / Images
                 |                             |
                 v                             v
           +-----------+                 +-----------+
           | App Server|                 |    CDN    |
           | Auth/API  |                 | Image     |
           +-----------+                 | Delivery  |
                 |                       +-----------+
                 |                             |
        +--------+---------+                   |
        |                  |                   v
        v                  v             +-------------+
 +-------------+    +-------------+      |   Object    |
 |   Primary   |    |    Queue    |      |   Storage   |
 |  Database   |    | Thumbnail   |      | Originals & |
 |  Metadata   |    |    Jobs     |      | Thumbnails  |
 +-------------+    +-------------+      +-------------+
        |                  |
        v                  v
 +-------------+    +-------------+
 | Read Replica|    |   Worker    |
 | Feed Reads  |    |  Thumbnail  |
 +-------------+    | Generation  |
                    +-------------+
                           |
                           v
                    +-------------+
                    |   Object    |
                    |   Storage   |
                    +-------------+

 Feed requests:
 Users -> Load Balancer -> App Servers -> Cache
                                      -> Database Read Replica

 Upload requests:
 Users -> Load Balancer -> App Servers
                              |
                              +--> Primary Database (metadata)
                              +--> Queue (thumbnail job)
 Users ---------------------------> Object Storage (photo upload)
```

## 7. Purpose of Each Component

- **Load balancer:** Distributes incoming application requests across healthy app servers so that one server does not handle all the traffic.
- **App servers:** Handle authentication, authorization, feed APIs, upload coordination, and business logic without storing the photo files themselves.
- **Cache:** Keeps frequently requested feed data or metadata available in memory to reduce repeated database queries and improve response times.
- **Primary database:** Stores authoritative records such as users, follows, photo metadata, captions, and upload status.
- **Database read replica:** Handles suitable read queries so that feed traffic places less pressure on the primary database.
- **Object storage:** Stores original photos and generated thumbnails durably and scales independently of the database.
- **Queue:** Holds thumbnail-generation jobs so that uploading a photo does not have to wait for thumbnail processing to finish.
- **Thumbnail worker:** Processes queued jobs, creates smaller image versions, and stores the thumbnails in object storage.
- **CDN:** Caches and delivers image files from locations closer to users, reducing latency and repeated requests to the origin object storage.

The CDN primarily serves image files; feed metadata and personalized feed responses are handled by the application and cache.

## 8. Photo Upload Flow

1. A user selects a photo and starts an upload in SnapShare.
2. The app server authenticates the user, checks upload permissions and validates the file's type and size.
3. The app server coordinates a secure, temporary upload URL for object storage so the client can upload the photo directly without sending the entire file through the app server.
4. The client uploads the original photo to object storage using the authorized upload URL.
5. After the upload succeeds, the application records the photo's metadata and storage key in the primary database.
6. The application adds a thumbnail-generation job to the queue.
7. A thumbnail worker retrieves the job, reads the original photo from object storage, and generates a 50 KB thumbnail target.
8. The worker saves the thumbnail in object storage and updates the database with its storage key and processing status.
9. The photo becomes available in the feed once its required metadata is ready. If thumbnails are still processing, the application can temporarily use a placeholder or the original image where appropriate.
10. When followers view the photo, the application retrieves feed metadata and provides the image location; the CDN serves cached images or retrieves them from object storage on a cache miss.

The queue and worker allow thumbnail processing to continue independently of the user's initial upload request.

## 9. Architecture Trade-Offs

### 9.1 Cache Speed Versus Freshness

Caching feed data and metadata can reduce database load and make feeds faster. However, cached information can become stale when a user uploads a new photo, deletes a photo, or changes follow settings. SnapShare must choose suitable expiration periods and invalidate or refresh important cached data when changes occur.

### 9.2 Read Replicas Versus Read Consistency

A read replica allows the system to handle more feed queries without sending every read to the primary database. However, replication may be delayed, meaning a user might not immediately see a newly uploaded photo or updated metadata when reading from the replica. The application can use the primary database for critical read-after-write requests and the replica for less time-sensitive reads.

### 9.3 Asynchronous Processing Versus Immediate Availability

Using a queue for thumbnail generation makes uploads faster and isolates image processing from normal API traffic. However, a thumbnail may not be available immediately, and jobs can fail or be delayed. SnapShare needs retry handling, monitoring, and a way to process failed jobs.

### 9.4 Object Storage and CDN Versus Cost and Complexity

Object storage and a CDN provide scalable image delivery and reduce pressure on app servers. However, storage, bandwidth, cache invalidation, access control, and lifecycle management add cost and operational complexity. SnapShare should monitor usage and apply suitable caching and retention policies.

## 10. Conclusion

SnapShare has an estimated one million daily active users, about 11.57 photo uploads per second, approximately 579 average feed views per second, and a peak of about 2,894 feed views per second. Original photos and thumbnails require approximately 748.25 TB of additional storage per year under the stated assumptions.

Because the system is read-heavy, the proposed design uses a CDN, cache, horizontally scalable app servers, and a database read replica to support feed traffic. Object storage holds the photo files, while a queue and thumbnail worker handle image processing asynchronously. This architecture separates responsibilities so that the system can scale its application, database, image delivery, and background processing as demand increases.
