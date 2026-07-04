// Pure distribution core — no Firebase imports, so the review-assignment
// mechanics can be unit-tested with `npm test` (see tests/distribution.test.js).
// logic.js wires these functions to Firestore transactions.

// Plain-text check: does the submission carry any real content?
// (auto-submitted empty work should not enter the review pool)
export const hasContent = (submission) =>
  !!(submission.content?.text || '').replace(/<[^>]*>/g, '').trim();

// Time a work was actually submitted. Falls back to createdAt for legacy
// docs (placeholder creation time), which was the old sort key.
export const submissionTime = (s) =>
  s.submittedAt?.toMillis?.() || s.createdAt?.toMillis?.() || 0;

// Should all N reviews be handed out at once (full mode), or one at a time
// (rolling mode)? Full mode kicks in when submissions are closed or when
// everyone expected has submitted.
export const isFullDistribution = ({ allowSubmissions, expectedCount, classSize, submittedCount, participantCount }) => {
  if (allowSubmissions === false) return true;
  const expectedTotal = expectedCount || classSize || participantCount;
  return submittedCount >= expectedTotal;
};

// Peer mode. Walks students in submission order and hands each one review
// tasks up to their target, always preferring the least-reviewed work.
//
// assignFn(reviewerSub, candidateSub, targetLimit) -> Promise<boolean>
// performs the actual (transactional) assignment and reports success.
export const distributePeer = async ({ submittedWorks, reviews, N, fullDistribution }, assignFn) => {
  const assignmentsMap = {};      // reviewerId -> [submissionId]
  const receivedCountMap = {};    // submissionId -> assigned reviews count
  const completedCountMap = {};   // reviewerId -> completed reviews count
  const assignedToMeCountMap = {}; // reviewerId -> assigned reviews count

  submittedWorks.forEach(s => {
    assignmentsMap[s.studentId] = [];

    const reviewsWrittenByThisSub = reviews.filter(r => r.reviewerId === s.studentId);
    completedCountMap[s.studentId] = Math.max(s.givenCompletedCount || 0, reviewsWrittenByThisSub.filter(r => r.status === 'completed').length);
    assignedToMeCountMap[s.studentId] = Math.max(s.givenReviewsCount || 0, reviewsWrittenByThisSub.length);

    reviewsWrittenByThisSub.forEach(r => assignmentsMap[s.studentId].push(r.submissionId));
  });

  submittedWorks.forEach(s => {
    const reviewsForThisSub = reviews.filter(r => r.submissionId === s.id).length;
    // We take the max of assignedCount and actual reviews to be safe
    receivedCountMap[s.id] = Math.max(s.assignedCount || 0, reviewsForThisSub);
  });

  // Sort students by submission time to be fair
  const students = [...submittedWorks].sort((a, b) => submissionTime(a) - submissionTime(b));

  // Only works with actual content can be reviewed (empty auto-submits
  // still make their author a reviewer, but nobody is asked to grade them)
  const reviewableWorks = submittedWorks.filter(hasContent);

  // Candidate order: least-reviewed work first, ties broken by circular
  // distance in submission order (student i prefers i+1, then i+2, …).
  // Combined with the round-based sweep below this reproduces the classic
  // rotation pattern from a clean state, which is a guaranteed-perfect
  // pairing — a plain greedy pass can dead-end with the last students
  // unable to give or receive all N reviews even when a full pairing exists.
  const indexOf = {};
  students.forEach((s, i) => { indexOf[s.studentId] = i; });
  const n = students.length;
  const circularDist = (reviewerId, candidate) =>
    (indexOf[candidate.studentId] - indexOf[reviewerId] + n) % n;

  const assignOneTo = async (studentSub, targetLimit) => {
    const studentId = studentSub.studentId;
    const candidates = reviewableWorks
      .filter(s => s.studentId !== studentId && !assignmentsMap[studentId].includes(s.id))
      .filter(s => (receivedCountMap[s.id] || 0) < N) // Strict limit check
      .sort((a, b) => {
        const diff = (receivedCountMap[a.id] || 0) - (receivedCountMap[b.id] || 0);
        if (diff !== 0) return diff;
        return circularDist(studentId, a) - circularDist(studentId, b);
      });

    // Try candidates one by one until one succeeds (transactionally)
    for (const candidate of candidates) {
      const success = await assignFn(studentSub, candidate, targetLimit);
      if (success) {
        assignmentsMap[studentId].push(candidate.id);
        receivedCountMap[candidate.id] = (receivedCountMap[candidate.id] || 0) + 1;
        assignedToMeCountMap[studentId]++;
        return true;
      }
    }
    return false;
  };

  // Breadth-first sweeps: each student gets at most one new task per round.
  // Depth-first (filling one student to N before moving on) exhausts the
  // early works and strands the last students without candidates.
  let progress = true;
  while (progress) {
    progress = false;
    for (const studentSub of students) {
      const studentId = studentSub.studentId;
      const completedByMe = completedCountMap[studentId] || 0;

      // In rolling mode, we only assign 1 review more than what's completed,
      // up to N. In full mode, we assign everything up to N.
      const targetLimit = fullDistribution ? N : Math.min(completedByMe + 1, N);
      if (assignedToMeCountMap[studentId] >= targetLimit || assignedToMeCountMap[studentId] >= N) continue;

      if (await assignOneTo(studentSub, targetLimit)) progress = true;
    }
  }
};

// Teacher-provided-texts mode. Texts are spread across the students who
// have opened the assignment (the reviewers). Each text is reviewed up to
// N times, work is balanced across reviewers, and a reviewer never gets a
// text they own.
//
// assignFn(reviewerProfile, textSub) -> Promise<boolean>
export const distributeTeacher = async ({ texts, reviewers, reviews, N }, assignFn) => {
  const receivedCountMap = {};
  texts.forEach(tx => {
    const actual = reviews.filter(r => r.submissionId === tx.id).length;
    receivedCountMap[tx.id] = Math.max(tx.assignedCount || 0, actual);
  });

  const reviewerState = {};
  reviewers.forEach(rv => {
    const mine = reviews.filter(r => r.reviewerId === rv.studentId);
    reviewerState[rv.studentId] = {
      assigned: Math.max(rv.givenReviewsCount || 0, mine.length),
      completed: Math.max(rv.givenCompletedCount || 0, mine.filter(r => r.status === 'completed').length),
      textIds: mine.map(r => r.submissionId)
    };
  });

  // Rolling distribution: give each reviewer one pending text at a time.
  const sortedReviewers = [...reviewers].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

  for (const rv of sortedReviewers) {
    const state = reviewerState[rv.studentId];
    const target = state.completed + 1;
    const reviewerEmail = (rv.email || '').toLowerCase();

    while (state.assigned < target) {
      const candidates = texts
        .filter(tx => (receivedCountMap[tx.id] || 0) < N)
        .filter(tx => !state.textIds.includes(tx.id))
        .filter(tx => !(tx.ownerEmails || []).includes(reviewerEmail))
        .sort((a, b) => {
          const diff = (receivedCountMap[a.id] || 0) - (receivedCountMap[b.id] || 0);
          if (diff !== 0) return diff;
          return (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0);
        });

      if (candidates.length === 0) break;

      let assigned = false;
      for (const candidate of candidates) {
        const success = await assignFn(rv, candidate);
        if (success) {
          state.textIds.push(candidate.id);
          receivedCountMap[candidate.id] = (receivedCountMap[candidate.id] || 0) + 1;
          state.assigned++;
          assigned = true;
          break;
        }
      }

      if (!assigned) break;
    }
  }
};
