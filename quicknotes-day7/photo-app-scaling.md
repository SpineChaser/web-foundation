# Day 7: Scaling a Photo-Sharing App

## 1. Understanding the Requirements

SnapShare is a photo-sharing application with the following requirements:

- 10 million registered users.
- 10% of registered users are active daily.
- Each daily active user uploads one photo per day.
- Each daily active user views 50 feed pages per day.
- Each original photo is approximately 2 MB.
- Each thumbnail is approximately 50 KB.
- The system must support fast uploads, reliable photo storage, and quick feed loading.

The application is read-heavy because users view feed pages much more frequently than they upload photos.

## 2. Capacity Estimates

### Daily active users

10,000,000 registered users × 10% active daily

**Daily active users = 1,000,000**

### Upload requests

Each daily active user uploads one photo per day.

1,000,000 uploads per day ÷ 86,400 seconds

Average upload rate ≈ **12 uploads per second**.

If peak traffic is five times the average, the system should support approximately **58 uploads per second** during busy periods.

### Feed requests

Each daily active user views 50 feed pages per day.

1,000,000 users × 50 feed pages = 50,000,000 feed requests per day.

50,000,000 ÷ 86,400 ≈ **579 feed requests per second**.

At five times the average traffic, peak feed traffic is approximately **2,894 requests per second**.

This is significantly higher than the upload rate, so feed delivery and caching are major priorities.

### Storage requirements

Original photos:

1,000,000 photos × 2 MB = 2,000,000 MB per day, approximately 2 TB per day.

2 TB × 365 days = **730 TB of original photos per year**.

Thumbnails:

1,000,000 thumbnails × 50 KB = 50,000,000 KB per day, approximately 50 GB per day.

50 GB × 365 days = **18.25 TB of thumbnails per year**.

The combined storage requirement is approximately 2.05 TB per day, or 748.25 TB per year, before replication, backups, and other overhead.

These estimates show why SnapShare needs scalable object storage rather than keeping image files inside relational database tables.

## 3. Proposed Architecture

The architecture separates photo files from application data and uses caching and background processing to handle high traffic.

```text
                    +----------------------+
                    |  Mobile App / Browser|
                    +----------+-----------+
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
        +----------------+          +----------------+
        |      CDN       |          | Load Balancer  |
        +-------+--------+          +-------+--------+
                |                           |
                v                 +---------+---------+
        +----------------+        |                   |
        | Object Storage |        v                   v
        | Original Photos|  +-------------+    +-------------+
        | and Thumbnails |  | App Server 1|    | App Server 2|
        +----------------+  +------+------+    +------+------+
                                   |                   |
                                   +---------+---------+
                                             |
                       +---------------------+------------------+
                       |                     |                  |
                       v                     v                  v
                +-------------+       +-------------+    +-------------+
                | Redis Cache |       | Primary DB  |    | Job Queue   |
                | Prepared    |       | Users,      |    | Thumbnail   |
                | Feeds       |       | Follows,    |    | Jobs        |
                +-------------+       | Photo Data  |    +------+------+
                                      +------+------+           |
                                             |                  v
                                             v          +----------------+
                                      +-------------+   | Thumbnail      |
                                      | Read        |   | Worker         |
                                      | Replicas    |   +-------+--------+
                                      +-------------+           |
                                                                v
                                                       +----------------+
                                                       | Object Storage |
                                                       | Save Thumbnail |
                                                       +----------------+
```

The CDN retrieves photo files from object storage and delivers them to users. The load balancer distributes API requests across multiple application servers. The application servers communicate with the cache, database, and job queue.

The thumbnail worker processes images in the background and saves the resulting thumbnails to object storage. The database stores photo metadata and thumbnail locations, while read replicas help serve database queries.

## 4. Main Components and Their Purposes

### CDN

A Content Delivery Network serves frequently requested photos from locations closer to users. It reduces download latency and decreases the amount of traffic reaching the origin storage.

### Object storage

Object storage holds original photos and generated thumbnails. It is designed for large files and can scale to accommodate hundreds of terabytes of image data.

### Load balancer

The load balancer distributes incoming API requests across healthy application servers. It prevents one server from receiving all the traffic and can stop routing requests to unhealthy servers.

### Application servers

Application servers handle authentication, photo uploads, feed requests, and other application logic. They should be stateless so that additional servers can be added when traffic increases.

### Redis cache

Redis stores frequently accessed or prepared feed data in memory. It reduces repeated database queries and helps the application respond quickly to thousands of feed requests per second.

### Primary database

The primary database is the source of truth for users, relationships between users, photo metadata, and references to stored files. Keeping image binaries outside the database prevents large files from bloating relational tables.

### Read replicas

Read replicas serve read-only database queries, such as retrieving photo metadata for feeds. They reduce the read workload on the primary database, which remains responsible for writes.

### Job queue

The job queue holds background tasks such as thumbnail generation. It allows the upload request to finish without waiting for image processing and helps workers retry failed jobs.

### Thumbnail worker

The thumbnail worker retrieves queued jobs, generates smaller versions of uploaded photos, stores the thumbnails in object storage, and updates their metadata in the database.

## 5. Step-by-Step Photo Upload Flow

1. A user selects a photo in the mobile application or browser and submits the upload request.

2. The request reaches an application server through the load balancer.

3. The application server verifies the user's authentication token and checks the file type, file size, and upload permissions.

4. The application server saves the original photo in object storage. The stored object is identified by a unique key.

5. The application server inserts a metadata record into the primary database. The record includes the photo ID, owner ID, object key, upload time, and thumbnail status.

6. The application server adds a job to the queue, such as **"Generate thumbnail for photo 123."**

7. The server returns a successful response, such as **HTTP 201 Created**, with the photo ID and available metadata. The user does not have to wait for thumbnail generation to finish.

8. A thumbnail worker retrieves the queued job and generates a smaller image of approximately 50 KB.

9. The worker saves the thumbnail in object storage and updates the photo record with its thumbnail object key or URL.

10. When the new photo should appear in followers' feeds, the application invalidates or updates the relevant cached feed entries. Subsequent feed requests can retrieve the updated information.

11. When users view the photo, the application retrieves its metadata and uses the CDN to deliver the original image or thumbnail from object storage.

This flow keeps the upload endpoint responsive while allowing image processing to happen independently.

## 6. Practical Trade-offs

### Trade-off 1: Feed speed versus freshness

Caching prepared feeds improves performance and reduces database load. However, a cached feed may not immediately show a newly uploaded photo.

SnapShare can invalidate affected feed entries or update them asynchronously. A short delay is a reasonable compromise when it improves overall performance.

### Trade-off 2: Fast uploads versus immediate thumbnail availability

Generating a thumbnail during the upload request would make users wait for image processing. Moving the work to a background queue makes uploads faster, but the thumbnail may not be available immediately.

The application can show the original photo or a temporary placeholder while the thumbnail is being generated. Failed jobs should be retried, and duplicate processing should be handled safely.

### Trade-off 3: Storage and delivery costs versus performance

Object storage and a CDN introduce storage, request, and data-transfer costs. However, they are generally better suited to large image collections than serving every image directly from application servers or storing all binary files in relational tables.

Caching frequently requested content, choosing suitable thumbnail sizes, and applying retention policies where appropriate can help manage costs.

### Trade-off 4: Read scaling versus database consistency

Read replicas distribute feed queries, but their data may briefly lag behind the primary database. Recently uploaded photos may therefore take a short time to appear in some feeds.

The application can read critical newly written information from the primary database when immediate consistency is necessary and use replicas for ordinary feed reads.

## 7. Conclusion

SnapShare needs an architecture designed around high read traffic, large image files, and asynchronous processing. The CDN and object storage handle photo delivery and storage, while the load balancer and stateless application servers support horizontal scaling.

Redis reduces repeated feed queries, read replicas distribute database reads, and the job queue with thumbnail workers prevents image processing from slowing down uploads.

The main design principle is to **separate large binary files from structured database records and move slow processing tasks into background jobs**. This provides a practical foundation for scaling SnapShare as its user base and photo collection grow.
