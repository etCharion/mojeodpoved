import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, collection, query, where, onSnapshot, getDoc, getCountFromServer } from 'firebase/firestore';

// Narrow per-student data for an assignment. The teacher's monitoring view
// subscribes to every submission and review of the assignment; doing the
// same for each student meant every page open downloaded the whole class
// (~120 docs for 30 students × N=3). A student only needs:
//   - their own submission/reviewer doc
//   - reviews they write (live — new tasks appear when distribution runs)
//   - reviews they received (peer mode) / reviews on texts they own (teacher mode)
//   - the content of the works assigned to them (fetched once each)
//   - the count of submitted works (aggregate query, 1 read per 1000 docs)
export function useStudentAssignmentData({ assignment, user, enabled }) {
  const assignmentId = assignment?.id;
  const isTeacherMode = assignment?.mode === 'teacher';
  const uid = user?.uid;
  const myEmail = (user?.email || '').toLowerCase();

  const [mySubmission, setMySubmission] = useState(undefined); // undefined = loading, null = none
  const [givenReviews, setGivenReviews] = useState(null);
  const [receivedReviews, setReceivedReviews] = useState(null); // peer mode
  const [ownedTexts, setOwnedTexts] = useState(null);           // teacher mode
  const [ownedTextReviews, setOwnedTextReviews] = useState({}); // teacher mode, chunkIdx -> reviews[]
  const [targets, setTargets] = useState({});                   // submissionId -> submission doc
  const [submittedCount, setSubmittedCount] = useState(0);

  const onError = (label) => (err) => console.error(`${label} listener error:`, err);

  // Own submission / reviewer profile
  useEffect(() => {
    if (!enabled || !assignmentId || !uid) return;
    const unsub = onSnapshot(doc(db, 'submissions', `${assignmentId}_${uid}`), (snap) => {
      setMySubmission(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, onError('Own submission'));
    return unsub;
  }, [enabled, assignmentId, uid]);

  // Reviews I write — live, so tasks assigned by someone else's distribution
  // run appear without a reload
  useEffect(() => {
    if (!enabled || !assignmentId || !uid) return;
    const q = query(collection(db, 'reviews'),
      where('assignmentId', '==', assignmentId),
      where('reviewerId', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      setGivenReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError('Given reviews'));
    return unsub;
  }, [enabled, assignmentId, uid]);

  // Peer mode: reviews of my work
  useEffect(() => {
    if (!enabled || !assignmentId || !uid || isTeacherMode) return;
    const q = query(collection(db, 'reviews'),
      where('assignmentId', '==', assignmentId),
      where('authorId', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      setReceivedReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError('Received reviews'));
    return unsub;
  }, [enabled, assignmentId, uid, isTeacherMode]);

  // Teacher mode: texts whose evaluation belongs to me
  useEffect(() => {
    if (!enabled || !assignmentId || !isTeacherMode || !myEmail) return;
    const q = query(collection(db, 'submissions'),
      where('assignmentId', '==', assignmentId),
      where('ownerEmails', 'array-contains', myEmail));
    const unsub = onSnapshot(q, (snap) => {
      setOwnedTexts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError('Owned texts'));
    return unsub;
  }, [enabled, assignmentId, isTeacherMode, myEmail]);

  // Teacher mode: reviews on my owned texts ('in' queries, chunks of 30)
  const ownedTextIdsKey = (ownedTexts || []).map(t => t.id).sort().join('|');
  useEffect(() => {
    if (!enabled || !assignmentId || !isTeacherMode || !ownedTextIdsKey) return;
    const ids = ownedTextIdsKey.split('|');
    const unsubs = [];
    for (let i = 0; i * 30 < ids.length; i++) {
      const chunk = ids.slice(i * 30, i * 30 + 30);
      const q = query(collection(db, 'reviews'), where('submissionId', 'in', chunk));
      unsubs.push(onSnapshot(q, (snap) => {
        setOwnedTextReviews(prev => ({ ...prev, [i]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
      }, onError('Owned text reviews')));
    }
    return () => unsubs.forEach(u => u());
  }, [enabled, assignmentId, isTeacherMode, ownedTextIdsKey]);

  // Content of works assigned to me — fetched once per work (it does not
  // change after submission)
  useEffect(() => {
    if (!enabled || !givenReviews) return;
    const missing = givenReviews
      .map(r => r.submissionId)
      .filter((id, i, arr) => arr.indexOf(id) === i && !(id in targets));
    missing.forEach(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'submissions', id));
        if (snap.exists()) {
          setTargets(prev => (id in prev) ? prev : { ...prev, [id]: { id: snap.id, ...snap.data() } });
        }
      } catch (err) {
        console.error('Assigned work fetch error:', err);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, givenReviews]);

  // How many works are submitted (waiting-room threshold). An aggregate
  // count costs 1 read per 1000 documents instead of downloading them all;
  // refreshed on a slow interval since it only gates the waiting room.
  useEffect(() => {
    if (!enabled || !assignmentId || isTeacherMode) return;
    let active = true;
    const refresh = async () => {
      try {
        const q = query(collection(db, 'submissions'),
          where('assignmentId', '==', assignmentId),
          where('status', '==', 'submitted'));
        const agg = await getCountFromServer(q);
        if (active) setSubmittedCount(agg.data().count);
      } catch (err) {
        console.error('Submitted count error:', err);
      }
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [enabled, assignmentId, isTeacherMode]);

  const submissions = useMemo(() => {
    const map = new Map();
    if (mySubmission) map.set(mySubmission.id, mySubmission);
    (ownedTexts || []).forEach(tx => map.set(tx.id, tx));
    Object.values(targets).forEach(sub => { if (!map.has(sub.id)) map.set(sub.id, sub); });
    return Array.from(map.values());
  }, [mySubmission, ownedTexts, targets]);

  const reviews = useMemo(() => {
    const map = new Map();
    const ownedIds = new Set((ownedTexts || []).map(t => t.id));
    (givenReviews || []).forEach(r => map.set(r.id, r));
    (receivedReviews || []).forEach(r => map.set(r.id, r));
    // guard against stale chunks after the owned-text set changed
    Object.values(ownedTextReviews).forEach(chunk => chunk.forEach(r => {
      if (ownedIds.has(r.submissionId)) map.set(r.id, r);
    }));
    return Array.from(map.values());
  }, [givenReviews, receivedReviews, ownedTextReviews, ownedTexts]);

  const loaded = enabled &&
    mySubmission !== undefined &&
    givenReviews !== null &&
    (isTeacherMode ? (ownedTexts !== null || !myEmail) : receivedReviews !== null);

  return { submissions, reviews, submittedCount, loaded };
}
