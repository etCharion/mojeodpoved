import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';

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

    submittedWorks.forEach(s => {
      assignmentsMap[s.studentId] = [];
      receivedCountMap[s.id] = 0;
      completedCountMap[s.studentId] = 0;
    });

    reviews.forEach(r => {
      if (!assignmentsMap[r.reviewerId]) assignmentsMap[r.reviewerId] = [];
      assignmentsMap[r.reviewerId].push(r.submissionId);
      receivedCountMap[r.submissionId] = (receivedCountMap[r.submissionId] || 0) + 1;
      if (r.status === 'completed') {
        completedCountMap[r.reviewerId] = (completedCountMap[r.reviewerId] || 0) + 1;
      }
    });

    // 4. Distribution Loop
    // Sort students by submission time to be fair
    const students = [...submittedWorks].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));

    for (const studentSub of students) {
      const studentId = studentSub.studentId;
      let assignedToMe = (assignmentsMap[studentId] || []).length;
      const completedByMe = completedCountMap[studentId] || 0;

      // In rolling mode, we only assign 1 review more than what's completed, up to N.
      // In full mode, we assign everything up to N.
      const targetLimit = isFullDistribution ? N : Math.min(completedByMe + 1, N);

      while (assignedToMe < targetLimit && assignedToMe < N) {
        const candidates = submittedWorks
          .filter(s => s.studentId !== studentId && !assignmentsMap[studentId].includes(s.id))
          .sort((a, b) => {
            const diff = (receivedCountMap[a.id] || 0) - (receivedCountMap[b.id] || 0);
            if (diff !== 0) return diff;
            return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
          });

        if (candidates.length === 0) break;

        const bestCandidate = candidates[0];
        const reviewId = `${studentId}_${bestCandidate.id}`;

        await setDoc(doc(db, 'reviews', reviewId), {
          assignmentId,
          classId: studentSub.classId,
          submissionId: bestCandidate.id,
          reviewerId: studentId,
          reviewerName: studentSub.studentName,
          authorId: bestCandidate.studentId,
          status: 'assigned',
          ratings: {},
          feedback: '',
          createdAt: serverTimestamp()
        });

        assignmentsMap[studentId].push(bestCandidate.id);
        receivedCountMap[bestCandidate.id] = (receivedCountMap[bestCandidate.id] || 0) + 1;
        assignedToMe++;
      }
    }
  } catch (err) {
    console.error("Distribution Error: ", err);
  }
};
