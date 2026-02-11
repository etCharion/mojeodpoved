import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { BookOpen, Users, Star, MessageSquare, Trash2, Edit, AlertCircle, RefreshCw, Eye, EyeOff, Lock, Send, ChevronDown, ChevronUp, ArrowUpDown, CheckCircle2, XCircle } from 'lucide-react';
import StudentAssignmentView from '../student/StudentAssignmentView';
import Breadcrumbs from '../../components/Breadcrumbs';
import RubricDisplay from '../../components/RubricDisplay';
import { runDistribution } from '../../lib/logic';
import { useTranslation } from 'react-i18next';

export default function AssignmentDetails() {
  const { t } = useTranslation();
  const { assignmentId } = useParams();
  const { userData } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedReviews, setExpandedReviews] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ field: 'completedAt', direction: 'desc' });

  useEffect(() => {
    if (!assignmentId) return;

    const unsubAssignment = onSnapshot(doc(db, 'assignments', assignmentId), (doc) => {
      if (doc.exists()) {
        setAssignment({ id: doc.id, ...doc.data() });
      }
      setLoading(false);
    });

    const unsubSubmissions = onSnapshot(query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId)), (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubReviews = onSnapshot(query(collection(db, 'reviews'), where('assignmentId', '==', assignmentId)), (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubAssignment();
      unsubSubmissions();
      unsubReviews();
    };
  }, [assignmentId]);

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm(t('assignment.delete_review_confirm'))) return;
    await deleteDoc(doc(db, 'reviews', reviewId));
  };

  const toggleField = async (field, value) => {
    await updateDoc(doc(db, 'assignments', assignmentId), {
      [field]: value,
      updatedAt: serverTimestamp()
    });
  };

  if (loading) return <div>{t('common.loading')}</div>;
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
            onClick={() => runDistribution(assignmentId)}
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
              onClick={() => toggleField('isVisible', assignment.isVisible === false)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors text-sm font-medium ${assignment.isVisible !== false ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
          >
              {assignment.isVisible !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{t('assignment.visibility')}</span>
          </button>

          <button
              onClick={() => toggleField('allowSubmissions', assignment.allowSubmissions === false)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors text-sm font-medium ${assignment.allowSubmissions !== false ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
          >
              {assignment.allowSubmissions !== false ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>{t('assignment.allow_submissions')}</span>
          </button>

          <button
              onClick={() => toggleField('allowReviews', assignment.allowReviews === false)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors text-sm font-medium ${assignment.allowReviews !== false ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
          >
              {assignment.allowReviews !== false ? <MessageSquare className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>{t('assignment.allow_reviews')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('assignment.submissions')}</p>
          <p className="text-4xl font-bold mt-2">{submissions.length}</p>
          <p className="text-sm text-gray-400 mt-1">{t('assignment.goal', { count: assignment.review_start_threshold })}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('assignment.reviews_completed')}</p>
          <p className="text-4xl font-bold mt-2">{reviews.filter(r => r.status === 'completed').length}</p>
          <p className="text-sm text-gray-400 mt-1">{t('assignment.total_assigned', { count: reviews.length })}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('assignment.average_score')}</p>
          <p className="text-4xl font-bold mt-2">
            {(() => {
              const passFailIds = new Set(assignment.rubric?.filter(i => i.type === 'passfail').map(i => i.id) || []);
              const completedReviews = reviews.filter(r => r.status === 'completed');
              if (completedReviews.length === 0) return '0.0';

              const totalSum = completedReviews.reduce((acc, r) => {
                const ratings = Object.entries(r.ratings || {})
                  .filter(([id]) => !passFailIds.has(id))
                  .map(([, val]) => val);
                if (ratings.length === 0) return acc;
                return acc + (ratings.reduce((a, b) => a + b, 0) / ratings.length);
              }, 0);
              return (totalSum / completedReviews.length).toFixed(1);
            })()}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t('assignment.across_criteria')}</p>
        </div>
      </div>

      {/* Submissions Table */}
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
                <th className="px-6 py-3 border-b">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.map((sub) => {
                const subReviews = reviews.filter(r => r.submissionId === sub.id);
                return (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{sub.studentName}</div>
                      <div className="text-xs text-gray-400">{sub.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs truncate text-sm text-gray-600 italic">
                        "{sub.content?.text?.substring(0, 50)}..."
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {subReviews.map((r, i) => (
                          <div
                            key={i}
                            title={r.status === 'completed' ? 'Completed' : 'Pending'}
                            className={`w-3 h-3 rounded-full ${r.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`}
                          ></div>
                        ))}
                        {subReviews.length === 0 && <span className="text-gray-400 text-xs italic">None yet</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">{t('assignment.work_submitted')}</span>
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-400">{t('assignment.no_submissions')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
            const authorName = submissions.find(s => s.id === review.submissionId)?.studentName || t('common.unknown');

            const passFailIds = new Set(assignment.rubric?.filter(i => i.type === 'passfail').map(i => i.id) || []);
            const numericRatings = Object.entries(review.ratings || {})
              .filter(([id]) => !passFailIds.has(id))
              .map(([, val]) => val);
            const avgRating = numericRatings.length > 0 ? (numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length).toFixed(1) : null;

            return (
              <div key={review.id} className="group transition-colors">
                <div
                  onClick={() => toggleExpand(review.id)}
                  className={`p-6 cursor-pointer hover:bg-gray-50 flex items-start justify-between gap-4 ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-indigo-600 truncate">{review.reviewerName}</span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-sm font-medium text-gray-700 truncate">{authorName}</span>
                      {avgRating && (
                        <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold border border-yellow-100">
                          {avgRating} <Star className="w-3 h-3 fill-current" />
                        </span>
                      )}
                      {review.agreement?.status && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase border ${review.agreement.status === 'agree' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                          {review.agreement.status === 'agree' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {review.agreement.status === 'agree' ? t('assignment.agree') : t('assignment.disagree')}
                        </span>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 italic truncate max-w-2xl">
                        "{review.feedback}"
                      </p>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                      <div className="space-y-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('assignment.ratings')}</p>
                        <RubricDisplay rubric={assignment.rubric} ratings={review.ratings} />
                      </div>
                      <div className="space-y-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('assignment.feedback')}</p>
                        <div className="bg-white p-4 rounded-xl text-sm text-gray-700 border italic shadow-sm relative">
                          <MessageSquare className="absolute -top-3 -left-3 w-6 h-6 text-indigo-100 fill-current" />
                          {review.feedback}
                        </div>
                        {review.agreement?.status && (
                          <div className="p-3 rounded-lg border bg-white shadow-sm space-y-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{t('assignment.agreement_status')}</p>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${review.agreement.status === 'agree' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {review.agreement.status === 'agree' ? t('assignment.agreed_by_author') : t('assignment.disagreed_by_author')}
                              </span>
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
    </div>
  );
}
