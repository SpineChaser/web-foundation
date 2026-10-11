-- Enable foreign key checking in SQLite
PRAGMA foreign_keys = ON;

-- Remove existing tables in the correct order
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS courses;

-- 1. Students table
CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    student_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- 2. Courses table
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    course_name TEXT NOT NULL,
    instructor TEXT NOT NULL
);

-- 3. Enrolments table
CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)
);

-- Sample students
INSERT INTO students (student_id, student_name, email) VALUES
(1, 'Grace Wanjiku', 'grace@example.com'),
(2, 'Brian Kamau', 'brian@example.com'),
(3, 'Faith Njeri', 'faith@example.com'),
(4, 'Kevin Otieno', 'kevin@example.com'),
(5, 'Mary Njeri', 'mary@example.com');

-- Sample courses
INSERT INTO courses (course_id, course_name, instructor) VALUES
(1, 'Web Development', 'Mr. Mwangi'),
(2, 'Database Systems', 'Ms. Achieng'),
(3, 'Computer Networking', 'Mr. Kiptoo');

-- Sample enrolments and grades
INSERT INTO enrolments
    (enrolment_id, student_id, course_id, grade)
VALUES
(1, 1, 1, 'A'),
(2, 1, 2, 'B'),
(3, 2, 1, 'B'),
(4, 2, 3, 'A'),
(5, 3, 2, 'A');

-- Query 1: Find all courses taken by one student
SELECT
    students.student_name,
    courses.course_name,
    enrolments.grade
FROM students
JOIN enrolments
    ON students.student_id = enrolments.student_id
JOIN courses
    ON enrolments.course_id = courses.course_id
WHERE students.student_name = 'Grace Wanjiku'
ORDER BY courses.course_name;

-- Query 2: Find all students enrolled in one course
SELECT
    courses.course_name,
    students.student_name,
    enrolments.grade
FROM courses
JOIN enrolments
    ON courses.course_id = enrolments.course_id
JOIN students
    ON enrolments.student_id = students.student_id
WHERE courses.course_name = 'Web Development'
ORDER BY students.student_name;

-- Query 3: Count students enrolled in each course
SELECT
    courses.course_name,
    COUNT(enrolments.student_id) AS total_students
FROM courses
LEFT JOIN enrolments
    ON courses.course_id = enrolments.course_id
GROUP BY courses.course_id, courses.course_name
ORDER BY courses.course_name;

-- Query 4: Find students who have no enrolments
SELECT
    students.student_id,
    students.student_name,
    students.email
FROM students
LEFT JOIN enrolments
    ON students.student_id = enrolments.student_id
WHERE enrolments.enrolment_id IS NULL;

-- Query 5: Update Grace Wanjiku's Database Systems grade
-- Change her grade from B to A
UPDATE enrolments
SET grade = 'A'
WHERE student_id = 1
  AND course_id = 2;

-- Verify Query 5: Display the updated grade
SELECT
    students.student_name,
    courses.course_name,
    enrolments.grade
FROM enrolments
JOIN students
    ON enrolments.student_id = students.student_id
JOIN courses
    ON enrolments.course_id = courses.course_id
WHERE enrolments.student_id = 1
  AND enrolments.course_id = 2;
