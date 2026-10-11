# School Database Design

## 1. Introduction

This project is a simple school database designed to manage student information, courses, enrolments, and grades. It uses three related tables to organize the data and retrieve information efficiently.

## 2. Database Tables

### 2.1 Students Table

The `students` table stores information about students.

`student_id`: Primary key that uniquely identifies each student.
`student_name`: Stores the student's full name and cannot be empty.
`email`: Stores the student's email address. It is required and must be unique.

### 2.2 Courses Table

The `courses` table stores information about courses offered by the school.

`course_id`: Primary key that uniquely identifies each course.
`course_name`: Stores the name of the course and cannot be empty.
`instructor`: Stores the name of the course instructor and cannot be empty.

### 2.3 Enrolments Table

The `enrolments` table connects students to courses and stores the grade each student receives.

`enrolment_id`: Primary key that uniquely identifies each enrolment.
`student_id`: Foreign key referencing `students(student_id)`.
`course_id`: Foreign key referencing `courses(course_id)`.
`grade`: Stores the student's grade for the course.

The combination of `student_id` and `course_id` is unique. This prevents the same student from enrolling in the same course more than once.

## 3. Relationships Between Tables

There is a one-to-many relationship between students and enrolments because one student can have several enrolment records, but each enrolment belongs to one student.

There is also a one-to-many relationship between courses and enrolments because one course can have many enrolment records, but each enrolment refers to one course.

Students and courses have a many-to-many relationship. One student can take several courses, and one course can have several students. The `enrolments` table resolves this relationship by linking the two tables and recording the grade for each student-course combination.

## 4. Database Index

I would add an index on `enrolments(course_id)` to improve queries that search for students taking a particular course or count enrolments in each course. This index can make course-based lookups more efficient as the database grows.

The SQL statement for creating this index is:

```sql
 CREATE INDEX idx_enrolments_course_id
 ON enrolments(course_id);
```

## 5. Choosing SQL or NoSQL

I would choose SQL for this school database because students, courses, and enrolments have structured data and clear relationships. A relational database supports primary keys, foreign keys, unique constraints, and JOIN operations, which help maintain data consistency and retrieve related information. SQLite is suitable for this project because it is lightweight and does not require a separate database server. A NoSQL database could be useful for flexible or unstructured data, but it is not necessary for this system.

## 6. Conclusion

This database demonstrates how SQL can be used to organize school records and manage student enrolments. The three related tables and their constraints help maintain accurate data, while SQL queries retrieve courses, students, enrolment counts, and updated grades.
