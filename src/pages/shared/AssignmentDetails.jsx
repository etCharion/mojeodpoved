import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, deleteDoc, getDocs, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import { BookOpen, Users, Star, MessageSquare, Trash2, Edit, AlertCircle, RefreshCw, Eye, EyeOff, Lock, Send, ChevronDown, ChevronUp, ArrowUpDown, Clock, RotateCcw, Plus, X, FileText, Mail } from 'lucide-react';
import StudentAssignmentView from '../student/StudentAssignmentView';
import Breadcrumbs from '../../components/Breadcrumbs';
import RubricDisplay from '../../components/RubricDisplay';
import { RichTextRenderer, RichTextInput } from '../../components/RichTextEditor';
import { runDistribution, runTeacherDistribution } from '../../lib/logic';
import { useTranslation } from 'react-i18next';

function TextEditorModal({ initial, classStudentEmails, onClose, onSave, t }) {
  const [label, setLabel] = useState(initial?.label || initial?.studentName || '');
  const [content, setContent] = useState(initial?.content?.text || '');
  const [ownerEmails, setOwnerEmails] = useState(new Set((initial?.ownerEmails || []).map(e => e.toLowerCase())));
  const [manualEmails, setManualEmails] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleEmail = (email) => {
    setOwnerEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleSave = async () => {
    const plain = content.replace(/<[^>]*>/g, '').trim();
    if (!plain) return;

    const manual = manualEmails
      .split(/[,\s\n\t;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const finalOwners = Array.from(new Set([...ownerEmails, ...manual]));

    setSaving(true);
    await onSave({
      label: label.trim() || t('assignment.teacher_texts'),
      content: { text: content },
      ownerEmails: finalOwners
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {initial ? t('assignment.edit_text') : t('assignment.add_text')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.text_label')}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('assignment.text_label_placeholder')}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.text_content')}</label>
            <RichTextInput
              content={content}
              onChange={setContent}
              placeholder={t('assignment.text_content')}
              editorClassName="min-h-[180px] p-4"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.owner_emails')}</label>
            <p className="text-xs text-gray-500 mb-2">{t('assignment.owner_emails_desc')}</p>
            {classStudentEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {classStudentEmails.map(email => {
                  const active = ownerEmails.has(email);
                  return (
                    <button
                      type="button"
                      key={email}
                      onClick={() => toggleEmail(email)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                    >
                      {email}
                    </button>
                  );
                })}
              </div>
            )}
            <textarea
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              placeholder={t('assignment.owner_emails_placeholder')}
              rows="2"
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-5 mt-2 border-t">
          <button onClick={onClose} className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !content.replace(/<[^>]*>/g, '').trim()}
            className="px-8 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold disabled:bg-gray-300"
          >
            {t('assignment.save_text')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssignmentDetails() {
  const { t } = useTranslation();
  const { assignmentId } = useParams();
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedReviews, setExpandedReviews] = useState(new Set());
  const [expandedSubmissions, setExpandedSubmissions] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ field: 'completedAt', direction: 'desc' });
  const [now, setNow] = useState(() => Date.now());
  const [testMode, setTestMode] = useState(false);
  const [mockSubmissions, setMockSubmissions] = useState([]);
  const [mockReviews, setMockReviews] = useState([]);
  const [classStudentEmails, setClassStudentEmails] = useState([]);
  const [textModal, setTextModal] = useState({ open: false, text: null });
  const [loadError, setLoadError] = useState(false);

  const isTeacherMode = assignment?.mode === 'teacher';

  const enterTestMode = () => {
    if (assignment?.mode === 'teacher') {
      const reviewerId = userData?.uid;
      const textId = `text_test_${assignmentId}`;
      setMockSubmissions([
        {
          id: `${assignmentId}_${reviewerId}`,
          assignmentId,
          classId: assignment?.classId,
          studentId: reviewerId,
          studentName: `${userData?.displayName || 'Teacher'} (Test)`,
          email: (userData?.email || '').toLowerCase(),
          status: 'reviewer',
          isReviewer: true,
          givenReviewsCount: 1,
          givenCompletedCount: 0,
          createdAt: { toMillis: () => Date.now() }
        },
        {
          id: textId,
          assignmentId,
          classId: assignment?.classId,
          isTeacherText: true,
          studentName: 'Text 1 (Test)',
          label: 'Text 1 (Test)',
          content: { text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' },
          ownerEmails: [],
          status: 'submitted',
          reviewCount: 0,
          assignedCount: 1,
          createdAt: { toMillis: () => Date.now() - 10000 }
        }
      ]);
      setMockReviews([
        {
          id: `rev_test_${assignmentId}`,
          assignmentId,
          submissionId: textId,
          reviewerId,
          reviewerName: userData?.displayName || 'Teacher',
          authorId: null,
          isTeacherText: true,
          status: 'assigned',
          ratings: {},
          feedback: '',
          createdAt: { toMillis: () => Date.now() }
        }
      ]);
      setTestMode(true);
      return;
    }
    setMockSubmissions([
      {
        id: `${assignmentId}_${userData?.uid}`,
        assignmentId: assignmentId,
        classId: assignment?.classId,
        studentId: userData?.uid,
        studentName: `${userData?.displayName || 'Teacher'} (Test)`,
        status: 'expected',
        reviewCount: 0,
        assignedCount: 0,
        givenReviewsCount: 0,
        givenCompletedCount: 0,
        createdAt: { toMillis: () => Date.now() }
      }
    ]);
    setMockReviews([]);
    setTestMode(true);
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!assignmentId) return;
    setLoading(true);
    setSubmissions(null);
    setReviews(null);
    setLoadError(false);

    const onListenerError = (err) => {
      console.error('Assignment data listener error:', err);
      setLoadError(true);
      setLoading(false);
      setSubmissions(prev => prev ?? []);
      setReviews(prev => prev ?? []);
    };

    const unsubAssignment = onSnapshot(doc(db, 'assignments', assignmentId), (doc) => {
      if (doc.exists()) {
        setAssignment({ id: doc.id, ...doc.data() });
      } else {
        setAssignment(null);
      }
      setLoading(false);
    }, onListenerError);

    const unsubSubmissions = onSnapshot(query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId)), (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, onListenerError);

    const unsubReviews = onSnapshot(query(collection(db, 'reviews'), where('assignmentId', '==', assignmentId)), (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, onListenerError);

    return () => {
      unsubAssignment();
      unsubSubmissions();
      unsubReviews();
    };
  }, [assignmentId]);

  useEffect(() => {
    if (!assignment?.classId) return;
    const unsub = onSnapshot(doc(db, 'classes', assignment.classId), (snap) => {
      if (snap.exists()) {
        setClassStudentEmails((snap.data().studentEmails || []).map(e => e.toLowerCase()));
      }
    }, (err) => console.error('Class listener error:', err));
    return () => unsub();
  }, [assignment?.classId]);

  const handleSaveText = async (data) => {
    try {
      if (textModal.text) {
        await updateDoc(doc(db, 'submissions', textModal.text.id), {
          label: data.label,
          studentName: data.label,
          content: data.content,
          ownerEmails: data.ownerEmails,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'submissions'), {
          assignmentId,
          classId: assignment.classId,
          isTeacherText: true,
          label: data.label,
          studentName: data.label,
          content: data.content,
          ownerEmails: data.ownerEmails,
          status: 'submitted',
          reviewCount: 0,
          assignedCount: 0,
          createdAt: serverTimestamp()
        });
      }
      await runTeacherDistribution(assignmentId);
    } catch (err) {
      console.error("Error saving text:", err);
      alert(t('assignment.error_saving'));
    }
  };

  const handleDeleteText = async (text) => {
    if (!window.confirm(t('assignment.delete_text_confirm'))) return;
    try {
      const q = query(collection(db, 'reviews'), where('submissionId', '==', text.id));
      const snap = await getDocs(q);
      const deletePromises = [
        ...snap.docs.map(d => {
          const reviewData = d.data();
          const reviewerRef = doc(db, 'submissions', `${assignmentId}_${reviewData.reviewerId}`);
          const updates = { givenReviewsCount: increment(-1) };
          if (reviewData.status === 'completed') updates.givenCompletedCount = increment(-1);
          return [deleteDoc(d.ref), updateDoc(reviewerRef, updates)];
        }).flat(),
        deleteDoc(doc(db, 'submissions', text.id))
      ];
      await Promise.all(deletePromises);
    } catch (err) {
      console.error("Error deleting text:", err);
      alert("Error deleting text");
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm(t('assignment.delete_review_confirm'))) return;
    const review = reviews.find(r => r.id === reviewId);
    if (!review) return;

    try {
      await deleteDoc(doc(db, 'reviews', reviewId));

      // Decrement counters on the target submission
      const subRef = doc(db, 'submissions', review.submissionId);
      const targetUpdates = {
        assignedCount: increment(-1)
      };
      if (review.status === 'completed') {
        targetUpdates.reviewCount = increment(-1);
      }
      await updateDoc(subRef, targetUpdates);

      // Decrement counters on the reviewer submission
      const reviewerSubRef = doc(db, 'submissions', `${assignmentId}_${review.reviewerId}`);
      const reviewerUpdates = {
        givenReviewsCount: increment(-1)
      };
      if (review.status === 'completed') {
        reviewerUpdates.givenCompletedCount = increment(-1);
      }
      await updateDoc(reviewerSubRef, reviewerUpdates);
    } catch (err) {
      console.error("Error deleting review:", err);
    }
  };

  const handleDeleteAssignment = async () => {
    if (!window.confirm(t('assignment.delete_confirm'))) return;
    try {
      const classId = assignment.classId;
      // 1. Delete reviews
      const qReviews = query(collection(db, 'reviews'), where('assignmentId', '==', assignmentId));
      const snapReviews = await getDocs(qReviews);

      // 2. Delete submissions
      const qSubmissions = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId));
      const snapSubmissions = await getDocs(qSubmissions);

      const deletePromises = [
        ...snapReviews.docs.map(d => deleteDoc(d.ref)),
        ...snapSubmissions.docs.map(d => deleteDoc(d.ref)),
        deleteDoc(doc(db, 'assignments', assignmentId))
      ];

      await Promise.all(deletePromises);
      navigate(`/teacher/class/${classId}`);
    } catch (err) {
      console.error(err);
      alert("Error deleting assignment");
    }
  };

  const handleDeleteSubmission = async (sub) => {
    if (!window.confirm(t('assignment.delete_submission_confirm'))) return;
    try {
      // 1. Delete reviews where this submission is the target
      const q1 = query(collection(db, 'reviews'), where('submissionId', '==', sub.id));
      const snap1 = await getDocs(q1);

      // 2. Delete reviews where this student is the reviewer
      const q2 = query(collection(db, 'reviews'), where('reviewerId', '==', sub.studentId), where('assignmentId', '==', assignmentId));
      const snap2 = await getDocs(q2);

      const deletePromises = [
        ...snap1.docs.map(d => {
          const reviewData = d.data();
          // For reviews targeting this submission, decrement counters on THEIR authors
          const authorSubRef = doc(db, 'submissions', `${assignmentId}_${reviewData.reviewerId}`);
          const updates = { givenReviewsCount: increment(-1) };
          if (reviewData.status === 'completed') updates.givenCompletedCount = increment(-1);
          return [deleteDoc(d.ref), updateDoc(authorSubRef, updates)];
        }).flat(),
        ...snap2.docs.map(d => {
          const reviewData = d.data();
          // For reviews this student wrote, decrement counters on THEIR targets
          const targetSubRef = doc(db, 'submissions', reviewData.submissionId);
          const updates = { assignedCount: increment(-1) };
          if (reviewData.status === 'completed') updates.reviewCount = increment(-1);
          return [deleteDoc(d.ref), updateDoc(targetSubRef, updates)];
        }).flat(),
        deleteDoc(doc(db, 'submissions', sub.id))
      ];

      await Promise.all(deletePromises);
    } catch (err) {
      console.error(err);
      alert("Error deleting submission");
    }
  };

  const handleReturnSubmission = async (sub) => {
    if (!window.confirm(t('assignment.return_confirm'))) return;
    try {
      // 1. Delete reviews where this submission is the target
      const q1 = query(collection(db, 'reviews'), where('submissionId', '==', sub.id));
      const snap1 = await getDocs(q1);

      // 2. Delete reviews where this student is the reviewer
      const q2 = query(collection(db, 'reviews'), where('reviewerId', '==', sub.studentId), where('assignmentId', '==', assignmentId));
      const snap2 = await getDocs(q2);

      const deletePromises = [
        ...snap1.docs.map(d => {
          const reviewData = d.data();
          const authorSubRef = doc(db, 'submissions', `${assignmentId}_${reviewData.reviewerId}`);
          const updates = { givenReviewsCount: increment(-1) };
          if (reviewData.status === 'completed') updates.givenCompletedCount = increment(-1);
          return [deleteDoc(d.ref), updateDoc(authorSubRef, updates)];
        }).flat(),
        ...snap2.docs.map(d => {
          const reviewData = d.data();
          const targetSubRef = doc(db, 'submissions', reviewData.submissionId);
          const updates = { assignedCount: increment(-1) };
          if (reviewData.status === 'completed') updates.reviewCount = increment(-1);
          return [deleteDoc(d.ref), updateDoc(targetSubRef, updates)];
        }).flat()
      ];
      await Promise.all(deletePromises);

      // 3. Reset the submission
      await updateDoc(doc(db, 'submissions', sub.id), {
        status: 'expected',
        content: null,
        writingStartedAt: null,
        reviewCount: 0,
        assignedCount: 0,
        givenReviewsCount: 0,
        givenCompletedCount: 0,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert("Error returning submission");
    }
  };

  const toggleField = async (field, value) => {
    await updateDoc(doc(db, 'assignments', assignmentId), {
      [field]: value,
      updatedAt: serverTimestamp()
    });
    if (field === 'allowSubmissions' && value === false) {
      await runDistribution(assignmentId);
    }
  };

  if (loadError && !assignment) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">{t('assignment.permission_error_title')}</p>
          <p className="text-sm mt-1">{t('assignment.permission_error_desc')}</p>
        </div>
      </div>
    );
  }
  if (loading || submissions === null || reviews === null) return <div>{t('common.loading')}</div>;
  if (!assignment) return <div>{t('common.unknown').replace('Unknown', 'Assignment not found')}</div>;

  const isTeacher = userData?.role === 'teacher';

  const toggleExpand = (id) => {
    const newExpanded = new Set(expandedReviews);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedReviews(newExpanded);
  };

  const toggleSubmissionExpand = (id) => {
    const newExpanded = new Set(expandedSubmissions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSubmissions(newExpanded);
  };

  const jumpToReview = (reviewId) => {
    setExpandedReviews(prev => {
      const next = new Set(prev);
      next.add(reviewId);
      return next;
    });
    setTimeout(() => {
      const el = document.getElementById(`review-${reviewId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const sortedReviews = [...reviews]
    .filter(r => r.status === 'completed')
    .sort((a, b) => {
      let valA, valB;
      if (sortConfig.field === 'reviewer') {
        valA = a.reviewerName?.toLowerCase() || '';
        valB = b.reviewerName?.toLowerCase() || '';
      } else if (sortConfig.field === 'author') {
        valA = (submissions.find(s => s.id === a.submissionId)?.studentName || '').toLowerCase();
        valB = (submissions.find(s => s.id === b.submissionId)?.studentName || '').toLowerCase();
      } else {
        valA = a.completedAt?.toMillis() || 0;
        valB = b.completedAt?.toMillis() || 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  if (!isTeacher) {
    return <StudentAssignmentView assignment={assignment} submissions={submissions} reviews={reviews} />;
  }

  if (testMode) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-800 text-white p-4 flex justify-between items-center rounded-xl shadow-lg mb-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="font-bold tracking-wide uppercase text-xs">{t('assignment.test_response')}</span>
          </div>
          <button
            onClick={() => setTestMode(false)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors text-sm font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            {t('assignment.back_to_monitoring')}
          </button>
        </div>
        <StudentAssignmentView
          assignment={assignment}
          submissions={mockSubmissions}
          reviews={mockReviews}
          isTestMode={true}
          setMockSubmissions={setMockSubmissions}
          setMockReviews={setMockReviews}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
            <p className="text-gray-500 mb-1">{t('assignment.monitoring')}</p>
            <Breadcrumbs />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={enterTestMode}
            className="flex items-center gap-2 border border-gray-300 bg-gray-50 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            title={t('assignment.test_response')}
          >
            <Send className="w-4 h-4" />
            <span>{t('assignment.test_response')}</span>
          </button>

          <button
            onClick={() => isTeacherMode ? runTeacherDistribution(assignmentId) : runDistribution(assignmentId)}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title={t('assignment.redistribute')}
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t('assignment.redistribute')}</span>
          </button>
          <Link
            to={`/teacher/assignment/edit/${assignmentId}`}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4" />
            <span>{t('assignment.edit_assignment')}</span>
          </Link>

          <button
            onClick={handleDeleteAssignment}
            className="flex items-center gap-2 border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
            title={t('assignment.delete_assignment')}
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('assignment.delete_assignment')}</span>
          </button>

          <button
              onClick={() => toggleField('isVisible', assignment.isVisible === false)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors text-sm font-medium ${assignment.isVisible !== false ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
          >
              {assignment.isVisible !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{t('assignment.visibility')}</span>
          </button>

          {!isTeacherMode && (
          <button
              onClick={() => toggleField('allowSubmissions', assignment.allowSubmissions === false)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors text-sm font-medium ${assignment.allowSubmissions !== false ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
          >
              {assignment.allowSubmissions !== false ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>{t('assignment.allow_submissions')}</span>
          </button>
          )}

          <button
              onClick={() => toggleField('allowReviews', assignment.allowReviews === false)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors text-sm font-medium ${assignment.allowReviews !== false ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
          >
              {assignment.allowReviews !== false ? <MessageSquare className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>{t('assignment.allow_reviews')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isTeacherMode ? (
          <div className="bg-white p-6 rounded-xl border">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('assignment.texts_count')}</p>
            <p className="text-4xl font-bold mt-2">
              {submissions.filter(s => s.isTeacherText).length}
            </p>
            <p className="text-sm text-gray-400 mt-1">{t('assignment.reviewers')}: {submissions.filter(s => s.status === 'reviewer').length}</p>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-xl border">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('assignment.submissions')}</p>
            <p className="text-4xl font-bold mt-2">
              {submissions.filter(s => s.status !== 'expected').length}
              <span className="text-xl text-gray-400 font-normal"> / {assignment.expected_submissions || submissions.length}</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">{t('assignment.goal', { count: assignment.review_start_threshold })}</p>
          </div>
        )}
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('assignment.reviews_completed')}</p>
          <p className="text-4xl font-bold mt-2">{reviews.filter(r => r.status === 'completed').length}</p>
          <p className="text-sm text-gray-400 mt-1">{t('assignment.total_assigned', { count: reviews.length })}</p>
        </div>
      </div>

      {assignment.timeLimit && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center gap-3 text-indigo-700">
           <Clock className="w-5 h-5" />
           <div className="text-sm">
             <span className="font-bold">{t('assignment.time_limit')}:</span> {assignment.timeLimit} {t('common.minutes').toLowerCase() || 'min'}
           </div>
        </div>
      )}

      {/* Teacher-provided texts management */}
      {isTeacherMode && (
        <section className="bg-white border rounded-xl overflow-hidden">
          <div className="p-6 border-b bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {t('assignment.teacher_texts')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{t('assignment.teacher_texts_desc')}</p>
            </div>
            <button
              onClick={() => setTextModal({ open: true, text: null })}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
            >
              <Plus className="w-5 h-5" />
              <span>{t('assignment.add_text')}</span>
            </button>
          </div>
          <div className="divide-y">
            {submissions.filter(s => s.isTeacherText)
              .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
              .map((text) => {
                const textReviews = reviews.filter(r => r.submissionId === text.id);
                const completedReviews = textReviews.filter(r => r.status === 'completed');
                return (
                  <div key={text.id} className="p-6 group hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900">{text.label || text.studentName}</h3>
                        <div className="text-sm text-gray-500 italic mt-1 line-clamp-2">
                          "{text.content?.text?.replace(/<[^>]*>/g, '').substring(0, 140)}..."
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded">
                            <Star className="w-3 h-3" />
                            {completedReviews.length} / {assignment.reviews_per_submission} {t('assignment.reviews_completed').toLowerCase()}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail className="w-3 h-3" />
                            {(text.ownerEmails && text.ownerEmails.length > 0)
                              ? text.ownerEmails.join(', ')
                              : t('assignment.no_owners')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setTextModal({ open: true, text })}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title={t('assignment.edit_text')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteText(text)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            {submissions.filter(s => s.isTeacherText).length === 0 && (
              <div className="p-12 text-center text-gray-400 italic">{t('assignment.no_texts')}</div>
            )}
          </div>
        </section>
      )}

      {/* Reviewer progress (teacher-provided texts mode) */}
      {isTeacherMode && submissions.filter(s => s.status === 'reviewer').length > 0 && (
        <section className="bg-white border rounded-xl overflow-hidden">
          <div className="p-6 border-b bg-gray-50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('assignment.reviewer_progress')}
            </h2>
          </div>
          <div className="divide-y">
            {submissions.filter(s => s.status === 'reviewer')
              .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''))
              .map((rv) => {
                const written = reviews.filter(r => r.reviewerId === rv.studentId);
                const done = written.filter(r => r.status === 'completed').length;
                return (
                  <div key={rv.id} className="px-6 py-4 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{rv.studentName}</div>
                      <div className="text-xs text-gray-400 truncate">{rv.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">
                        {done} / {written.length} {t('assignment.reviews_completed').toLowerCase()}
                      </span>
                      <div className="flex gap-1">
                        {written.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => r.status === 'completed' && jumpToReview(r.id)}
                            title={r.status === 'completed' ? t('assignment.view_detail') : t('common.pending')}
                            className={`w-3 h-3 rounded-full ${r.status === 'completed' ? 'bg-green-500 cursor-pointer hover:ring-2 ring-green-200' : 'bg-gray-300 cursor-default'}`}
                          ></button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Submissions Table */}
      {!isTeacherMode && (
      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t('assignment.student_submissions')}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-3 border-b">{t('assignment.student')}</th>
                <th className="px-6 py-3 border-b">{t('assignment.content')}</th>
                <th className="px-6 py-3 border-b">{t('assignment.reviews_received')}</th>
                <th className="px-6 py-3 border-b">{t('assignment.reviews_written')}</th>
                <th className="px-6 py-3 border-b">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.sort((a, b) => {
                if (a.status === 'expected' && b.status !== 'expected') return 1;
                if (a.status !== 'expected' && b.status === 'expected') return -1;
                return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
              }).map((sub) => {
                const subReviews = reviews.filter(r => r.submissionId === sub.id);
                const writtenReviews = reviews.filter(r => r.reviewerId === sub.studentId);
                const isExpected = sub.status === 'expected';
                const isSubExpanded = expandedSubmissions.has(sub.id);

                return (
                  <React.Fragment key={sub.id}>
                    <tr className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => !isExpected && toggleSubmissionExpand(sub.id)}
                          className={`flex items-start gap-2 text-left ${!isExpected ? 'hover:text-indigo-600 transition-colors' : ''}`}
                          disabled={isExpected}
                        >
                          {!isExpected && (
                            <div className="mt-1">
                              {isSubExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{sub.studentName}</div>
                            <div className="text-xs text-gray-400">{sub.studentId}</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        {isExpected ? (
                          <div className="text-sm text-gray-400 italic flex items-center gap-1">
                            {sub.writingStartedAt && assignment.timeLimit ? (
                              <div className="flex items-center gap-1 text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
                                <Clock className="w-3 h-3 animate-pulse" />
                                {(() => {
                                  const start = sub.writingStartedAt.toMillis();
                                  const limit = assignment.timeLimit * 60 * 1000;
                                  const remaining = Math.max(0, start + limit - now);
                                  const totalSeconds = Math.floor(remaining / 1000);
                                  const mins = Math.floor(totalSeconds / 60);
                                  const secs = totalSeconds % 60;
                                  return `${mins}:${secs.toString().padStart(2, '0')}`;
                                })()}
                              </div>
                            ) : (
                              <>
                                <Clock className="w-3 h-3" /> {t('assignment.status_expected')}
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="max-w-xs truncate text-sm text-gray-600 italic">
                            "{sub.content?.text?.replace(/<[^>]*>/g, '').substring(0, 50)}..."
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {subReviews.map((r, i) => {
                            const revSub = submissions.find(s => s.studentId === r.reviewerId);
                            const revName = revSub?.studentName || r.reviewerName || t('common.unknown');
                            return (
                              <button
                                key={i}
                                onClick={() => r.status === 'completed' && jumpToReview(r.id)}
                                title={t('assignment.review_by', { name: revName })}
                                className={`w-3 h-3 rounded-full ${r.status === 'completed' ? 'bg-green-500 cursor-pointer hover:ring-2 ring-green-200' : 'bg-gray-300 cursor-default'}`}
                              ></button>
                            );
                          })}
                          {subReviews.length === 0 && !isExpected && <span className="text-gray-400 text-xs italic">None yet</span>}
                          {isExpected && <span className="text-gray-300 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {writtenReviews.map((r, i) => {
                            const targetSub = submissions.find(s => s.id === r.submissionId);
                            const targetName = targetSub?.studentName || t('common.unknown');
                            return (
                              <button
                                key={i}
                                onClick={() => r.status === 'completed' && jumpToReview(r.id)}
                                title={t('assignment.review_for', { name: targetName })}
                                className={`w-3 h-3 rounded-full ${r.status === 'completed' ? 'bg-indigo-500 cursor-pointer hover:ring-2 ring-indigo-200' : 'bg-gray-300 cursor-default'}`}
                              ></button>
                            );
                          })}
                          {writtenReviews.length === 0 && !isExpected && <span className="text-gray-400 text-xs italic">None yet</span>}
                          {isExpected && <span className="text-gray-300 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          {isExpected ? (
                            <span className="text-sm font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">{t('assignment.status_expected')}</span>
                          ) : (
                            <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">{t('assignment.status_submitted')}</span>
                          )}
                          <button
                            onClick={() => handleReturnSubmission(sub)}
                            className="text-orange-300 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                            title={t('assignment.return_submission')}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubmission(sub)}
                            className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isSubExpanded && !isExpected && (
                      <tr className="bg-gray-50/50">
                        <td colSpan="5" className="px-6 py-4 border-b">
                          <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                            <div>
                              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('assignment.content')}</h4>
                              <div className="text-gray-700 text-sm leading-relaxed">
                                <RichTextRenderer content={sub.content?.text || ''} />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                              <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('assignment.reviews_received')}</h4>
                                <div className="space-y-2">
                                  {subReviews.length > 0 ? (
                                    subReviews.map(r => {
                                      const revSub = submissions.find(s => s.studentId === r.reviewerId);
                                      const revName = revSub?.studentName || r.reviewerName || t('common.unknown');
                                      return (
                                        <button
                                          key={r.id}
                                          onClick={() => r.status === 'completed' && jumpToReview(r.id)}
                                          className={`flex items-center gap-2 text-sm font-medium ${r.status === 'completed' ? 'text-indigo-600 hover:underline' : 'text-gray-400 cursor-default'}`}
                                        >
                                          <div className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                          {t('assignment.review_by', { name: revName })}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <p className="text-xs text-gray-400 italic">{t('common.none')}</p>
                                  )}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('assignment.reviews_written')}</h4>
                                <div className="space-y-2">
                                  {writtenReviews.length > 0 ? (
                                    writtenReviews.map(r => {
                                      const targetSub = submissions.find(s => s.id === r.submissionId);
                                      const targetName = targetSub?.studentName || t('common.unknown');
                                      return (
                                        <button
                                          key={r.id}
                                          onClick={() => r.status === 'completed' && jumpToReview(r.id)}
                                          className={`flex items-center gap-2 text-sm font-medium ${r.status === 'completed' ? 'text-indigo-600 hover:underline' : 'text-gray-400 cursor-default'}`}
                                        >
                                          <div className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-indigo-500' : 'bg-gray-300'}`}></div>
                                          {t('assignment.review_for', { name: targetName })}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <p className="text-xs text-gray-400 italic">{t('common.none')}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-400">{t('assignment.no_submissions')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Reviews Detail */}
      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="p-6 border-b bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            {t('assignment.all_reviews')}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1 text-sm">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <select
                value={`${sortConfig.field}-${sortConfig.direction}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split('-');
                  setSortConfig({ field, direction });
                }}
                className="outline-none bg-transparent cursor-pointer font-medium"
              >
                <option value="completedAt-desc">{t('assignment.sort_newest')}</option>
                <option value="completedAt-asc">{t('assignment.sort_oldest')}</option>
                <option value="reviewer-asc">{t('assignment.sort_reviewer_az')}</option>
                <option value="reviewer-desc">{t('assignment.sort_reviewer_za')}</option>
                <option value="author-asc">{t('assignment.sort_author_az')}</option>
                <option value="author-desc">{t('assignment.sort_author_za')}</option>
              </select>
            </div>
            <div className="flex gap-1 border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedReviews(new Set(sortedReviews.map(r => r.id)))}
                className="bg-white px-3 py-1.5 text-xs font-bold hover:bg-gray-50 border-r"
              >
                {t('assignment.expand_all')}
              </button>
              <button
                onClick={() => setExpandedReviews(new Set())}
                className="bg-white px-3 py-1.5 text-xs font-bold hover:bg-gray-50"
              >
                {t('assignment.collapse_all')}
              </button>
            </div>
          </div>
        </div>
        <div className="divide-y">
          {sortedReviews.map((review) => {
            const isExpanded = expandedReviews.has(review.id);
            const authorSubmission = submissions.find(s => s.id === review.submissionId);
            const authorName = authorSubmission?.studentName || t('common.unknown');

            return (
              <div key={review.id} id={`review-${review.id}`} className="group transition-colors">
                <div
                  onClick={() => toggleExpand(review.id)}
                  className={`p-6 cursor-pointer hover:bg-gray-50 flex items-start justify-between gap-4 ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-indigo-600 truncate">{review.reviewerName}</span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-sm font-medium text-gray-700 truncate">{authorName}</span>
                      {review.agreement?.rating && (
                        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-gray-50 border border-gray-100">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-2.5 h-2.5 ${star <= review.agreement.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                    {!isExpanded && (
                      <div className="text-xs text-gray-500 italic truncate max-w-2xl">
                        {review.feedback?.replace(/<[^>]*>/g, '')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteReview(review.id);
                      }}
                      className="text-red-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-indigo-100/50 bg-indigo-50/10">
                    <div className="mt-4 p-4 bg-white rounded-xl border border-indigo-100 shadow-sm">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('assignment.original_text')}</p>
                      <div className="text-sm text-gray-600 italic leading-relaxed">
                        <RichTextRenderer content={review.highlightedSubmission || authorSubmission?.content?.text || ''} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                      <div className="space-y-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('assignment.ratings')}</p>
                        <RubricDisplay rubric={assignment.rubric} ratings={review.ratings} />
                      </div>
                      <div className="space-y-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('assignment.feedback')}</p>
                        <div className="bg-white p-4 rounded-xl text-sm text-gray-700 border shadow-sm relative">
                          <MessageSquare className="absolute -top-3 -left-3 w-6 h-6 text-indigo-100 fill-current" />
                          <RichTextRenderer content={review.feedback} />
                        </div>
                        {review.agreement?.rating && (
                          <div className="p-3 rounded-lg border bg-white shadow-sm space-y-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{t('assignment.agreement_status')}</p>
                            <div className="flex items-center gap-3">
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-3.5 h-3.5 ${star <= review.agreement.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                                  />
                                ))}
                              </div>
                              {review.agreement.note && <span className="text-xs text-gray-500">— {review.agreement.note}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {sortedReviews.length === 0 && (
            <div className="p-12 text-center text-gray-400 italic">{t('assignment.no_reviews')}</div>
          )}
        </div>
      </section>

      {textModal.open && (
        <TextEditorModal
          initial={textModal.text}
          classStudentEmails={classStudentEmails}
          onClose={() => setTextModal({ open: false, text: null })}
          onSave={handleSaveText}
          t={t}
        />
      )}
    </div>
  );
}
