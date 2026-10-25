# Course Reflection

The most difficult concept for me was understanding how a system stays correct when multiple users make requests at nearly the same time. A seat can look available on a page, but another customer might try to buy it at the same moment. I worked through this by studying database transactions, row locks, conditional updates, unique constraints, and idempotency. I now understand that the database must be the final authority, not the browser or a cached seat map.

Based on the feedback from my QuickNotes System Design capstone, I would improve how I verify that a submission is complete and saved in the exact required folder. The feedback showed that my document ended before the data model, double-booking strategy, architecture, and trade-offs were included. I would improve my process by checking every requirement against a checklist, previewing the full Markdown document, confirming that the diagram is complete, and opening the files from the repository before committing.

Next, I want to learn how to build a working backend API with Node.js, Express, and PostgreSQL. I want to practise transactions and concurrent requests with tests, then learn more about authentication, automated testing, and deployment. This will help me turn system designs into applications that are reliable under real-world traffic.
