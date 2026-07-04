# PeerGrade Data Schema

## Collections

### `users`
- `uid`: string (doc id)
- `email`: string
- `displayName`: string
- `photoURL`: string
- `role`: 'teacher' | 'student'
- `createdAt`: timestamp

### `classes`
- `id`: string (doc id)
- `name`: string
- `teacherId`: string
- `studentEmails`: string[] (pre-approved)
- `studentUids`: string[] (joined)
- `pendingStudents`: { email, uid, displayName }[]
- `createdAt`: timestamp

### `assignments`
- `id`: string (doc id)
- `classId`: string
- `title`: string
- `description`: string
- `rubric`: { id, type: 'stars'|'choice', question, options?: string[] }[]
- `mandatory_feedback`: boolean
- `min_char_count`: number
- `reviews_per_submission`: number (N — in `teacher` mode this is reviews per text)
- `review_start_threshold`: number (M — peer mode only)
- `mode`: 'peer' | 'teacher' (default 'peer'). In `teacher` mode the teacher provides the texts to review (see below); students act only as reviewers.
- `timeLimit`: number | null (minutes of writing time, peer mode only)
- `timerStart`: 'typing' | 'open' (default 'typing') — whether the countdown starts on the first keystroke or as soon as the student opens the assignment
- `expected_submissions`: number | null (peer mode; when empty the class roster size is used to decide "everyone submitted")
- `status`: 'open' | 'closed'
- `createdAt`: timestamp

### `submissions`
A submission doc is one of three shapes depending on the assignment mode:

**Peer-mode student work** (and the placeholder for it):
- `id`: string (`${assignmentId}_${studentId}`)
- `assignmentId`: string
- `studentId`: string
- `studentName`: string
- `content`: { text: string }
- `status`: 'expected' | 'submitted'
- `reviewCount`: number (how many reviews it has COMPLETED/RECEIVED)
- `assignedCount`: number (how many reviewers it has been ASSIGNED to, including pending ones)
- `givenReviewsCount`: number (how many reviews this student has been ASSIGNED to write)
- `givenCompletedCount`: number (how many reviews this student has COMPLETED writing)
- `writingStartedAt`: timestamp (when the countdown started, only with `timeLimit`)
- `submittedAt`: timestamp (when the work was actually submitted; `createdAt` is the placeholder/first-open time)
- `createdAt`: timestamp

**Teacher-provided text** (`mode: 'teacher'`):
- `id`: string (auto-generated)
- `assignmentId`, `classId`: string
- `isTeacherText`: true
- `label`: string (display name of the text, also mirrored into `studentName` for reuse)
- `content`: { text: string }
- `ownerEmails`: string[] (lowercased student emails who see the resulting evaluation as if they submitted the text)
- `status`: 'submitted'
- `reviewCount`, `assignedCount`: number
- `createdAt`: timestamp

**Reviewer profile** (`mode: 'teacher'`, one per student who opened the assignment):
- `id`: string (`${assignmentId}_${studentId}`)
- `assignmentId`, `classId`: string
- `studentId`, `studentName`, `email`: string
- `status`: 'reviewer'
- `isReviewer`: true
- `givenReviewsCount`, `givenCompletedCount`: number
- `createdAt`: timestamp

### `reviews`
- `id`: string (doc id: reviewerId_submissionId)
- `assignmentId`: string
- `submissionId`: string
- `reviewerId`: string
- `authorId`: string (null for teacher-provided texts; recipients are matched via the text's `ownerEmails`)
- `isTeacherText`: boolean (true when reviewing a teacher-provided text)
- `reviewerName`: string (visible to teacher only?)
- `status`: 'assigned' | 'completed'
- `ratings`: { [criteriaId]: number }
- `feedback`: string
- `agreement`: { rating: number | null, note: string }
- `createdAt`: timestamp
