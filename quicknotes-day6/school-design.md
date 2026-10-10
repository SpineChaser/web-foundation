# School Database Design

## 1. Introduction

This document describes the design of a simple school database. The database stores student details, course information, and the grades students receive in their courses.

## 2. Database Entities

### 2.1 Students

The students table stores information about students.

`student_id`: Primary key that uniquely identifies each student.
`student_name`: The student's full name.
`email`: The student's email address, which must be unique when provided.

### 2.2 Courses

The courses table stores information about courses offered by the school.

`course_id`: Primary key that uniquely identifies each course.
`course_name`: The name of the course.
`instructor`: The name of the course instructor.

### 2.3 Enrolments

The enrolments table connects students to the courses they take and stores their grades.

`enrolment_id`: Primary key that uniquely identifies each enrolment.
`student_id`: Foreign key referencing the students table.
`course_id`: Foreign key referencing the courses table.
`grade`: The grade a student receives in a course.

The combination of `student_id` and `course_id` is unique so that a student cannot be enrolled in the same course more than once.

## 3. Relationships

One student can enrol in many courses.
One course can have many students.
Each enrolment belongs to one student and one course.
The enrolments table resolves the many-to-many relationship between students and courses.

## 4. Database Queries

The database includes five queries:

1. Display all students.
2. Display students alongside their courses and grades using `JOIN`.
3. Count students enrolled in each course using `LEFT JOIN`, `GROUP BY`, and `COUNT`.
4. Calculate average grade points for each course using `AVG` and `GROUP BY`.
5. Display all students and their courses using `LEFT JOIN`, including students who have not enrolled in any course.

## 5. Conclusion

This database design organizes school information into three related tables. Primary keys identify records, foreign keys link related records, and SQL queries retrieve useful information about students, courses, enrolments, and grades.