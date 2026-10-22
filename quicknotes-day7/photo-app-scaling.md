# SnapShare: Planning for Growth

## 1. Overview

SnapShare allows people to share photos and view posts from accounts they follow. As more people join, the application must handle two main activities: receiving new photos and delivering feeds quickly.

The main challenge is that viewing photos happens much more frequently than uploading them. This plan estimates the expected workload and proposes a system that can grow without forcing every request through one server or storing large image files in the database.

## 2. Planning Assumptions

I have used the figures provided in the assignment and made the following assumptions:

- The platform has 10 million registered users.
- Ten per cent of registered users use the platform on a typical day.
- Each daily active user uploads one photo and views 50 feed pages per day.
- An original photo averages 2 MB, while its thumbnail averages 50 KB.
- A day has 86,400 seconds, and a year has 365 days.
- Peak feed traffic is five times the average traffic.
- All original photos and thumbnails remain stored for the full year.
- Storage calculations use decimal units: 1 TB equals 1,000 GB.
- The estimate covers original photos and thumbnails, not backups, database files, logs, or additional replicas.

These assumptions provide a starting point for capacity planning. Actual traffic would need to be measured after launch.

## 3. Estimating Users, Requests and Storage

### 3.1 Daily active users

Only a portion of registered users are expected to visit each day.

10,000,000 × 0.10 = **1,000,000 daily active users**

SnapShare therefore needs to support approximately one million active users per day.

### 3.2 Photo upload rate

If every active user uploads one photo daily:

1,000,000 × 1 = 1,000,000 photo uploads per day

To calculate the average uploads per second:

1,000,000 ÷ 86,400 = **11.57 uploads per second**

The system should be designed around an average of about 12 uploads per second. Uploads may arrive in bursts, so the application should not rely on a single server.

### 3.3 Feed traffic

Each active user opens 50 feed pages daily.

1,000,000 × 50 = 50,000,000 feed views per day

Average feed views per second:

50,000,000 ÷ 86,400 = **578.70 views per second**

Peak feed views per second:

578.70 × 5 = **2,893.52 views per second**

Rounded for planning, SnapShare needs to handle approximately **579 average feed views per second and 2,894 at peak**. These figures represent feed-page requests, not the number of individual images downloaded.

### 3.4 Annual photo storage

Original photos:

- Daily: 1,000,000 × 2 MB = 2,000,000 MB, or 2 TB.
- Yearly: 2 TB × 365 = **730 TB**.

Thumbnails:

- Daily: 1,000,000 × 50 KB = 50 GB.
- Yearly: 50 GB × 365 = **18.25 TB**.

Total new storage required each year:

730 TB + 18.25 TB = **748.25 TB per year**.

This is the estimated storage for one year's uploads and their thumbnails. The total storage used by the live platform would continue to grow if older photos were retained.

## 4. What Kind of System Is SnapShare?

SnapShare is mainly a **read-heavy system**. Each active user views 50 feed pages for every one photo uploaded, so reading content is expected to place greater demand on the application than writing new content.

The architecture should therefore prioritize quick feed responses and efficient image delivery. A cache can reduce repeated database lookups, a read replica can handle suitable read queries, and a CDN can deliver frequently requested images closer to users.

Uploads still need to be reliable. The system must confirm that original photos are stored safely and make thumbnail generation recoverable if a background job fails.

## 5. Storing Photos Outside the Database

I would store photo files in object storage and keep their descriptive information in the database.

The database would hold records such as the photo ID, owner, caption, upload time, visibility, and storage keys. The actual image bytes would remain in object storage.

This separation is useful because image files are much larger than ordinary database records. Putting all those files inside the database would increase its size and make backups and recovery more demanding. Object storage is better suited to handling large collections of files, while the database can focus on relationships and searchable metadata.

A CDN would cache image files and deliver them to users without requiring every image request to reach the original storage location.

## 6. Proposed Architecture

The diagram separates normal application requests from photo storage and background thumbnail processing.

```text
                         SNAPSHARE USERS
                                |
                        +----------------+
                        | Load Balancer  |
                        +----------------+
                                |
                        +----------------+
                        |  App Servers   |
                        | Login and APIs |
                        +----------------+
                          /      |       \
                         /       |        \
                        v        v         v
                 +----------+ +---------+ +-----------+
                 |  Cache   | | Primary | |   Queue   |
                 | Feed Data| | Database| | Thumbnail |
                 +----------+ +----+----+ |   Jobs    |
                                  |       +-----+-----+
                                  v             |
                            +-----------+       v
                            | Read      | +-------------+
                            | Replica   | | Thumbnail  |
                            |           | |   Worker   |
                            +-----------+ +------+------+
                                                |
                                                v
                                      +-------------------+
                                      |   Object Storage  |
                                      | Original Photos & |
                                      |    Thumbnails     |
                                      +---------+---------+
                                                |
                                                v
                                         +------------+
                                         |    CDN     |
                                         | Image      |
                                         | Delivery   |
                                         +------------+

Photo upload:
User -> Load Balancer -> App Servers -> Upload authorization
User -> Object Storage -> Original photo saved
App Servers -> Primary Database (photo metadata)
App Servers -> Queue -> Thumbnail Worker -> Object Storage

Feed and image viewing:
User -> Load Balancer -> App Servers -> Cache / Read Replica
User -> CDN -> Cached image or Object Storage on a cache miss
```

## 7. What Each Component Does

- **Load balancer:** Spreads incoming application requests across healthy servers so that one server does not become the main bottleneck.
- **App servers:** Handle logins, permissions, feed requests, upload coordination, and communication with other services.
- **Cache:** Keeps frequently requested feed information available for faster responses and fewer repeated database queries.
- **Primary database:** Stores the authoritative user, follow, photo metadata, and upload-status records.
- **Read replica:** Serves suitable read queries to reduce the amount of feed traffic handled by the primary database.
- **Object storage:** Keeps original images and thumbnails separately from the relational database and accommodates growing photo collections.
- **Queue:** Holds thumbnail tasks until a worker is ready to process them, so uploading does not have to wait for image resizing.
- **Thumbnail worker:** Takes queued tasks, creates smaller image versions, and saves them back to object storage.
- **CDN:** Delivers cached images from locations closer to users, reducing image-loading delays and requests to the origin storage.

The cache and read replica serve different purposes: the cache can answer repeated requests quickly, while the replica can run database queries when the needed information is not cached.

## 8. What Happens When a Photo Is Uploaded?

1. A user selects a photo and starts the upload.
2. The app server checks the user's identity, permissions, file type, and file-size limit.
3. The application provides a short-lived, authorized upload URL so the photo can be sent directly to object storage.
4. The user's device uploads the original image to object storage.
5. After the upload is confirmed, the application records the photo's metadata and storage key in the primary database.
6. The application places a thumbnail-generation task in the queue.
7. A thumbnail worker retrieves the task and reads the original photo from object storage.
8. The worker creates a smaller version targeting approximately 50 KB and saves it in object storage.
9. The worker records the thumbnail location and processing status. The feed can show the photo when its required metadata is ready, using a placeholder if the thumbnail is not yet available.
10. When another user views the photo, SnapShare retrieves the feed information and the CDN serves the image from its cache or fetches it from object storage if necessary.

This approach keeps large file transfers away from the app servers and allows thumbnail generation to continue independently. Failed thumbnail tasks should be retried and monitored rather than silently lost.

## 9. Trade-Offs and Design Decisions

### 9.1 Faster feeds versus fresh information

Caching can reduce response times and database load, especially when popular posts are requested repeatedly. However, cached information may be outdated after a photo is deleted or a user changes their follow settings. SnapShare needs suitable cache-expiration rules and a way to invalidate important entries when data changes.

### 9.2 More read capacity versus immediate consistency

A read replica allows more queries to be served without overloading the primary database. The disadvantage is that updates may take time to appear on the replica. For example, a user might not immediately see a newly uploaded photo in their feed. The application can use the primary database for important read-after-write operations and the replica for less time-sensitive requests.

### 9.3 Responsive uploads versus background delays

A queue lets the application accept a photo without waiting for thumbnail generation to finish. However, the thumbnail may take time to appear if workers are busy or a job fails. Retry handling, monitoring, and a clear processing status are needed to prevent incomplete processing from going unnoticed.

### 9.4 Scalable image delivery versus operating costs

Object storage and a CDN can handle large image collections and reduce repeated requests to the origin. However, stored data, image downloads, and cache management have costs. SnapShare should monitor storage and bandwidth use and consider retention rules that fit its product requirements.

## 10. Conclusion

The estimates suggest that SnapShare will have one million daily active users, average about 11.57 uploads per second, and receive around 579 feed views per second on average. At five times average traffic, feed requests could reach approximately 2,894 per second. Original photos and thumbnails would add around 748.25 TB of storage per year.

The proposed design addresses these demands by separating application processing, database queries, image storage, and thumbnail creation. Because feed traffic is expected to dominate, caching, read replicas, and a CDN are important parts of the design. As the platform grows, measured traffic and operational costs should guide further scaling decisions.
