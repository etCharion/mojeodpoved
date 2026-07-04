import { db } from './firebase';
import { collection, query, where, getDocs, getDoc, doc, serverTimestamp, runTransaction, increment } from 'firebase/firestore';
import { isFullDistribution, distributePeer, distributeTeacher } from './distribution';

// Re-exported for UI code (teacher's submissions table)
export { hasContent } from './distribution';

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

      // Rolling limit for the reviewer too: at most one pending text at a
      // time. Without this, concurrent distribution runs (several students
      // finishing at once) can hand one reviewer several texts in parallel.
      const reviewerData = reviewerSnap.data();
      if ((reviewerData.givenReviewsCount || 0) > (reviewerData.givenCompletedCount || 0)) return false;

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

const fetchAssignment = async (assignmentId) => {
  const snap = await getDoc(doc(db, 'assignments', assignmentId));
  return snap.exists() ? snap.data() : null;
};

const fetchByAssignment = async (collectionName, assignmentId) => {
  const snap = await getDocs(query(collection(db, collectionName), where('assignmentId', '==', assignmentId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Distribution for the "teacher provides texts" mode.
// `preloaded` may carry { assignment, submissions, reviews } that the caller
// already has from live listeners, saving a full re-fetch. The transactions
// in tryAssignTeacherReview re-check every limit, so slightly stale input is
// safe — at worst an assignment attempt is skipped.
export const runTeacherDistribution = async (assignmentId, preloaded = {}) => {
  try {
    const assignmentData = preloaded.assignment || await fetchAssignment(assignmentId);
    if (!assignmentData) return;

    if (assignmentData.allowReviews === false) return;
    const N = assignmentData.reviews_per_submission;

    const allDocs = preloaded.submissions || await fetchByAssignment('submissions', assignmentId);

    const texts = allDocs.filter(s => s.isTeacherText);
    const reviewers = allDocs.filter(s => s.status === 'reviewer');

    if (texts.length === 0 || reviewers.length === 0) return;

    const reviews = preloaded.reviews || await fetchByAssignment('reviews', assignmentId);

    await distributeTeacher(
      { texts, reviewers, reviews, N },
      (reviewer, candidate) => tryAssignTeacherReview(reviewer, candidate, assignmentId, reviewer.classId, N)
    );
  } catch (err) {
    console.error("Teacher Distribution Error: ", err);
  }
};

export const runDistribution = async (assignmentId, preloaded = {}) => {
  try {
    // 1. Assignment settings
    const assignmentData = preloaded.assignment || await fetchAssignment(assignmentId);
    if (!assignmentData) return;
    const {
      reviews_per_submission: N,
      review_start_threshold: M,
      expected_submissions: expectedCount,
      allowSubmissions
    } = assignmentData;

    // 2. All submissions (including placeholders)
    const allParticipants = preloaded.submissions || await fetchByAssignment('submissions', assignmentId);

    // Filter to those who actually submitted work
    const submittedWorks = allParticipants.filter(s => s.status !== 'expected');

    // Distribution only starts when M works are submitted
    if (submittedWorks.length < M) return;

    // Without an explicit expected count, compare against the class roster,
    // not against placeholder docs (those only count students who opened
    // the assignment, so full distribution could fire too early or never).
    let classSize = 0;
    if (!expectedCount && allowSubmissions !== false && assignmentData.classId) {
      const classSnap = await getDoc(doc(db, 'classes', assignmentData.classId));
      classSize = classSnap.exists() ? (classSnap.data().studentUids || []).length : 0;
    }

    const fullDistribution = isFullDistribution({
      allowSubmissions,
      expectedCount,
      classSize,
      submittedCount: submittedWorks.length,
      participantCount: allParticipants.length
    });

    // 3. All current reviews
    const reviews = preloaded.reviews || await fetchByAssignment('reviews', assignmentId);

    // 4. Distribution loop (pure core, transactional assignment)
    await distributePeer(
      { submittedWorks, reviews, N, fullDistribution },
      (reviewerSub, candidate, targetLimit) =>
        tryAssignReview(reviewerSub.studentId, reviewerSub.studentName, candidate, assignmentId, reviewerSub.classId, N, targetLimit)
    );
  } catch (err) {
    console.error("Distribution Error: ", err);
  }
};
