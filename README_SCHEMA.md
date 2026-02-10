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
- `reviews_per_submission`: number (N)
- `review_start_threshold`: number (M)
- `status`: 'open' | 'closed'
- `createdAt`: timestamp

### `submissions`
- `id`: string (doc id)
- `assignmentId`: string
- `studentId`: string
- `studentName`: string
- `content`: { text: string }
- `reviewCount`: number (how many reviews it has RECEIVED)
- `assignedCount`: number (how many reviewers it has been ASSIGNED to)
- `createdAt`: timestamp

### `reviews`
- `id`: string (doc id: reviewerId_submissionId)
- `assignmentId`: string
- `submissionId`: string
- `reviewerId`: string
- `authorId`: string
- `reviewerName`: string (visible to teacher only?)
- `status`: 'assigned' | 'completed'
- `ratings`: { [criteriaId]: number }
- `feedback`: string
- `agreement`: { status: 'agree' | 'disagree' | null, note: string }
- `createdAt`: timestamp
