import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const runDistribution = async (assignmentId) => {
  try {
    // 1. Fetch assignment settings
    const assignmentSnap = await getDocs(query(collection(db, 'assignments'), where('__name__', '==', assignmentId)));
    if (assignmentSnap.empty) return;
    const assignmentData = assignmentSnap.docs[0].data();
    const { reviews_per_submission: N, review_start_threshold: M } = assignmentData;

    // 2. Fetch all submissions
    const subsQuery = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId));
    const subsSnapshot = await getDocs(subsQuery);
    const submissions = subsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (submissions.length < M) return;

    // 3. Fetch all current reviews
    const reviewsQuery = query(collection(db, 'reviews'), where('assignmentId', '==', assignmentId));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    const reviews = reviewsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Map to track who is reviewing what
    const assignmentsMap = {}; // reviewerId -> [submissionId]
    const receivedCountMap = {}; // submissionId -> count

    submissions.forEach(s => {
      assignmentsMap[s.studentId] = [];
      receivedCountMap[s.id] = 0;
    });

    reviews.forEach(r => {
      if (!assignmentsMap[r.reviewerId]) assignmentsMap[r.reviewerId] = [];
      assignmentsMap[r.reviewerId].push(r.submissionId);
      receivedCountMap[r.submissionId] = (receivedCountMap[r.submissionId] || 0) + 1;
    });

    // 4. Distribution Loop
    const students = [...submissions].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));

    for (const studentSub of students) {
      const studentId = studentSub.studentId;
      let assignedToMe = (assignmentsMap[studentId] || []).length;

      while (assignedToMe < N) {
        const candidates = submissions
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
