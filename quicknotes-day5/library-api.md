# Library Books REST API

## 1. Introduction

This document describes a REST API for managing books in a library. The API allows users to view books, find a specific book, add new books, update existing books, delete books, and search for books by author.

### Resource Details

**Resource:** Books
**Base path:** `/api/books`
**Data format:** JSON

Each book contains an ID, title, author, publication year, and ISBN.

## 2. API Endpoints

### Endpoint 1: List All Books

**Method:** `GET`
**Path:** `/api/books`
**Description:** Retrieves a list of all books available in the library.
**Example request body:** Not required.
**Success status code:** `200 OK`

### Endpoint 2: Get One Book

**Method:** `GET`
**Path:** `/api/books/{id}`
**Description:** Retrieves the details of a specific book using its ID.
**Example request body:** Not required.
**Success status code:** `200 OK`

**Example request:** `GET /api/books/1`

### Endpoint 3: Create a Book

**Method:** `POST`
**Path:** `/api/books`
**Description:** Adds a new book to the library.
**Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "publicationYear": 1958,
  "isbn": "9780385474542"
}
```

**Success status code:** `201 Created`

### Endpoint 4: Update a Book

**Method:** `PUT`
**Path:** `/api/books/{id}`
**Description:** Updates the details of an existing book identified by its ID.
**Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "publicationYear": 1958,
  "isbn": "9780385474542"
}
```

**Success status code:** `200 OK`

### Endpoint 5: Delete a Book

**Method:** `DELETE`
**Path:** `/api/books/{id}`
**Description:** Removes a specific book from the library using its ID.
**Example request body:** Not required.
**Success status code:** `204 No Content`

### Endpoint 6: List Books by Author

**Method:** `GET`
**Path:** `/api/books?author=Chinua%20Achebe`
**Description:** Retrieves books written by the author specified in the `author` query parameter.
**Example request body:** Not required.
**Success status code:** `200 OK`

## 3. Error Responses

### Error 400: Bad Request

**Description:** The request contains invalid or missing information.
**Example:** A client tries to create a book without providing its title.
**Example status response:** `400 Bad Request`

### Error 404: Not Found

**Description:** The requested book or resource does not exist.
**Example:** A client requests `GET /api/books/999`, but no book with ID `999` exists.
**Example status response:** `404 Not Found`

## 4. Conclusion

This REST API design provides a simple way to manage library books. It uses standard HTTP methods and status codes to support creating, retrieving, updating, deleting, and searching for books.
