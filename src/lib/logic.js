import { db } from './firebase';
import { collection, query, where, getDocs, doc, serverTimestamp, runTransaction, increment } from 'firebase/firestore';

const tryAssignReview = async (reviewerId, reviewerName, candidate, assignmentId, classId, N, targetLimit) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const reviewerSubId = `${assignmentId}_${reviewerId}`;
      const reviewerSubRef = doc(db, 'submissions', reviewerSubId);
      const subRef = doc(db, 'submissions', candidate.id);

      const [reviewerSnap, subSnap] = await Promise.all([
        transaction.get(reviewerSubRef),
        transaction.get(subRef)
      ]);

      if (!reviewerSnap.exists() || !subSnap.exists()) return false;

      const reviewerData = reviewerSnap.data();
      const subData = subSnap.data();

      const currentGiven = reviewerData.givenReviewsCount || 0;
      const currentReceived = subData.assignedCount || 0;

      // Double check limits inside transaction to prevent race conditions
      if (currentGiven >= targetLimit || currentGiven >= N) return false;
      if (currentReceived >= N) return false;

      const reviewId = `${reviewerId}_${candidate.id}`;
      const reviewRef = doc(db, 'reviews', reviewId);
      const reviewSnap = await transaction.get(reviewRef);

      if (reviewSnap.exists()) return false;

      transaction.set(reviewRef, {
        assignmentId,
        classId,
        submissionId: candidate.id,
        reviewerId,
        reviewerName,
        authorId: subData.studentId,
        status: 'assigned',
        ratings: {},
        feedback: '',
        createdAt: serverTimestamp()
      });

      transaction.update(subRef, {
        assignedCount: increment(1)
      });

      transaction.update(reviewerSubRef, {
        givenReviewsCount: increment(1)
      });

      return true;
    });
  } catch (err) {
    console.error("Atomic Assignment Error:", err);
    return false;
  }
};

// Atomically assign one teacher-provided text to a student reviewer.
const tryAssignTeacherReview = async (reviewer, candidate, assignmentId, classId, N) => {
  try {
    return await runTransaction(db, async (transaction) => {
      const reviewerRef = doc(db, 'submissions', reviewer.id);
      const textRef = doc(db, 'submissions', candidate.id);

      const [reviewerSnap, textSnap] = await Promise.all([
        transaction.get(reviewerRef),
        transaction.get(textRef)
      ]);

      if (!reviewerSnap.exists() || !textSnap.exists()) return false;

      const textData = textSnap.data();
      if ((textData.assignedCount || 0) >= N) return false;

      const reviewId = `${reviewer.studentId}_${candidate.id}`;
      const reviewRef = doc(db, 'reviews', reviewId);
      const reviewSnap = await transaction.get(reviewRef);
      if (reviewSnap.exists()) return false;

      transaction.set(reviewRef, {
        assignmentId,
        classId,
        submissionId: candidate.id,
        reviewerId: reviewer.studentId,
        reviewerName: reviewer.studentName,
        authorId: null,
        isTeacherText: true,
        status: 'assigned',
        ratings: {},
        feedback: '',
        createdAt: serverTimestamp()
      });

      transaction.update(textRef, { assignedCount: increment(1) });
      transaction.update(reviewerRef, { givenReviewsCount: increment(1) });

      return true;
    });
  } catch (err) {
    console.error("Atomic Teacher Assignment Error:", err);
    return false;
  }
};

// Distribution for the "teacher provides texts" mode.
// Teacher-provided texts are spread across the students who have opened the
// assignment (the reviewers). Each text is reviewed up to N times, work is
// balanced across reviewers, and a reviewer never gets a text they own.
export const runTeacherDistribution = async (assignmentId) => {
  try {
    const assignmentSnap = await getDocs(query(collection(db, 'assignments'), where('__name__', '==', assignmentId)));
    if (assignmentSnap.empty) return;
    const assignmentData = assignmentSnap.docs[0].data();

    if (assignmentData.allowReviews === false) return;
    const N = assignmentData.reviews_per_submission;

    const subsSnapshot = await getDocs(query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId)));
    const allDocs = subsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const texts = allDocs.filter(s => s.isTeacherText);
    const reviewers = allDocs.filter(s => s.status === 'reviewer');

    if (texts.length === 0 || reviewers.length === 0) return;

    const reviewsSnapshot = await getDocs(query(collection(db, 'reviews'), where('assignmentId', '==', assignmentId)));
    const reviews = reviewsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

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
          const success = await tryAssignTeacherReview(rv, candidate, assignmentId, rv.classId, N);
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
  } catch (err) {
    console.error("Teacher Distribution Error: ", err);
  }
};

export const runDistribution = async (assignmentId) => {
  try {
    // 1. Fetch assignment settings
    const assignmentSnap = await getDocs(query(collection(db, 'assignments'), where('__name__', '==', assignmentId)));
    if (assignmentSnap.empty) return;
    const assignmentData = assignmentSnap.docs[0].data();
    const {
      reviews_per_submission: N,
      review_start_threshold: M,
      expected_submissions: expectedCount,
      allowSubmissions
    } = assignmentData;

    // 2. Fetch all submissions (including placeholders)
    const subsQuery = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId));
    const subsSnapshot = await getDocs(subsQuery);
    const allParticipants = subsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter to those who actually submitted work
    const submittedWorks = allParticipants.filter(s => s.status !== 'expected');

    // Distribution only starts when M works are submitted
    if (submittedWorks.length < M) return;

    // Determine if we should distribute all N reviews or just one-by-one
    const everyoneSubmitted = expectedCount
      ? submittedWorks.length >= expectedCount
      : submittedWorks.length >= allParticipants.length;

    const isFullDistribution = (allowSubmissions === false) || everyoneSubmitted;

    // 3. Fetch all current reviews
    const reviewsQuery = query(collection(db, 'reviews'), where('assignmentId', '==', assignmentId));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    const reviews = reviewsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Map to track who is reviewing what
    const assignmentsMap = {}; // reviewerId -> [submissionId]
    const receivedCountMap = {}; // submissionId -> count
    const completedCountMap = {}; // reviewerId -> count of completed reviews
    const assignedToMeCountMap = {}; // reviewerId -> count of assigned reviews

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

    // 4. Distribution Loop
    // Sort students by submission time to be fair
    const students = [...submittedWorks].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));

    for (const studentSub of students) {
      const studentId = studentSub.studentId;
      const completedByMe = completedCountMap[studentId] || 0;

      // In rolling mode, we only assign 1 review more than what's completed, up to N.
      // In full mode, we assign everything up to N.
      const targetLimit = isFullDistribution ? N : Math.min(completedByMe + 1, N);

      while (assignedToMeCountMap[studentId] < targetLimit && assignedToMeCountMap[studentId] < N) {
        const candidates = submittedWorks
          .filter(s => s.studentId !== studentId && !assignmentsMap[studentId].includes(s.id))
          .filter(s => (receivedCountMap[s.id] || 0) < N) // Strict limit check
          .sort((a, b) => {
            const diff = (receivedCountMap[a.id] || 0) - (receivedCountMap[b.id] || 0);
            if (diff !== 0) return diff;
            return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
          });

        if (candidates.length === 0) break;

        let successfullyAssigned = false;
        // Try candidates one by one until one succeeds (transactionally)
        for (const candidate of candidates) {
          const success = await tryAssignReview(studentId, studentSub.studentName, candidate, assignmentId, studentSub.classId, N, targetLimit);
          if (success) {
            assignmentsMap[studentId].push(candidate.id);
            receivedCountMap[candidate.id] = (receivedCountMap[candidate.id] || 0) + 1;
            assignedToMeCountMap[studentId]++;
            successfullyAssigned = true;
            break;
          }
        }

        if (!successfullyAssigned) break; // No more candidates can be assigned right now
      }
    }
  } catch (err) {
    console.error("Distribution Error: ", err);
  }
};
