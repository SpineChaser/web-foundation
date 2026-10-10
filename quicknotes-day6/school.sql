DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS courses;

-- 1. Students table
CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    student_name TEXT NOT NULL,
    email TEXT UNIQUE
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
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)
);


-- Sample students
INSERT INTO students (student_id, student_name, email) VALUES
(1, 'Grace Wanjiku', 'grace@example.com'),
(2, 'Brian Kamau', 'brian@example.com'),
(3, 'Faith Njeri', 'faith@example.com'),
(4, 'Kevin Otieno', 'kevin@example.com');

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

-- Query 1: Display all students
SELECT *
FROM students;

-- Query 2: Display each student and the courses they take
SELECT
    students.student_name,
    courses.course_name,
    enrolments.grade
FROM enrolments
JOIN students
    ON enrolments.student_id = students.student_id
JOIN courses
    ON enrolments.course_id = courses.course_id
ORDER BY students.student_name;

-- Query 3: Count the students enrolled in each course
SELECT
    courses.course_name,
    COUNT(enrolments.student_id) AS total_students
FROM courses
LEFT JOIN enrolments
    ON courses.course_id = enrolments.course_id
GROUP BY courses.course_id, courses.course_name
ORDER BY courses.course_name;

-- Query 4: Calculate the average grade
-- Grades are converted to points: A = 4, B = 3, C = 2, D = 1, F = 0
SELECT
    courses.course_name,
    ROUND(AVG(
        CASE enrolments.grade
            WHEN 'A' THEN 4
            WHEN 'B' THEN 3
            WHEN 'C' THEN 2
            WHEN 'D' THEN 1
            WHEN 'F' THEN 0
        END
    ), 2) AS average_grade_points
FROM courses
LEFT JOIN enrolments
    ON courses.course_id = enrolments.course_id
GROUP BY courses.course_id, courses.course_name
ORDER BY courses.course_name;

-- Query 5: Display all students, including those not enrolled
SELECT
    students.student_name,
    courses.course_name,
    enrolments.grade
FROM students
LEFT JOIN enrolments
    ON students.student_id = enrolments.student_id
LEFT JOIN courses
    ON enrolments.course_id = courses.course_id
ORDER BY students.student_name;
