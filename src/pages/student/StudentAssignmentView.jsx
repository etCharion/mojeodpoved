import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { Send, CheckCircle, Clock, Star, MessageSquare, AlertCircle, ThumbsUp, ThumbsDown, RefreshCw, Users, BookOpen } from 'lucide-react';
import Breadcrumbs from '../../components/Breadcrumbs';
import { runDistribution } from '../../lib/logic';
import { useTranslation } from 'react-i18next';

export default function StudentAssignmentView({ assignment, submissions, reviews }) {
  const { t } = useTranslation();
  const { user, userData } = useAuth();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeReview, setActiveReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ ratings: {}, feedback: '' });
  const [metaReviewNotes, setMetaReviewNotes] = useState({});

  const mySubmission = submissions.find(s => s.studentId === user.uid);
  const myReviewsGiven = reviews.filter(r => r.reviewerId === user.uid);
  const myReviewsReceived = reviews.filter(r => r.authorId === user.uid && r.status === 'completed');

  const canReview = submissions.length >= assignment.review_start_threshold;
  const reviewsNeeded = assignment.reviews_per_submission;
  const reviewsCompleted = myReviewsGiven.filter(r => r.status === 'completed').length;

  const handleSubmitWork = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'submissions'), {
        assignmentId: assignment.id,
        classId: assignment.classId,
        studentId: user.uid,
        studentName: user.displayName,
        content: { text },
        reviewCount: 0,
        assignedCount: 0,
        createdAt: serverTimestamp()
      });

      // Trigger distribution logic
      await runDistribution(assignment.id);
    } catch (err) {
      console.error(err);
      alert(t('assignment.error_submitting_work'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (assignment.mandatory_feedback && reviewForm.feedback.length < assignment.min_char_count) {
      alert(t('assignment.char_required').replace('{{current}}', reviewForm.feedback.length).replace('{{min}}', assignment.min_char_count));
      return;
    }

    try {
      await updateDoc(doc(db, 'reviews', activeReview.id), {
        status: 'completed',
        ratings: reviewForm.ratings,
        feedback: reviewForm.feedback,
        completedAt: serverTimestamp()
      });

      // Update the submission's reviewCount
      const subRef = doc(db, 'submissions', activeReview.submissionId);
      await updateDoc(subRef, {
        reviewCount: (submissions.find(s => s.id === activeReview.submissionId)?.reviewCount || 0) + 1
      });

      setActiveReview(null);
      setReviewForm({ ratings: {}, feedback: '' });
    } catch (err) {
      console.error(err);
      alert(t('assignment.error_saving_review'));
    }
  };

  const handleMetaReview = async (reviewId, status, note) => {
    await updateDoc(doc(db, 'reviews', reviewId), {
      agreement: { status, note, updatedAt: serverTimestamp() }
    });
  };

  // UI rendering based on status
  if (!mySubmission) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{assignment.title}</h1>
          <p className="text-gray-500 mt-2">{assignment.description}</p>
          <div className="flex justify-center mt-2">
            <Breadcrumbs />
          </div>
        </div>

        {assignment.allowSubmissions !== false ? (
          <form onSubmit={handleSubmitWork} className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
            <h2 className="text-xl font-semibold">{t('assignment.submit_work')}</h2>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-64 p-4 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={t('assignment.type_response')}
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
            >
              <Send className="w-5 h-5" />
              {submitting ? t('common.loading') : t('assignment.submit_review').replace('Review', 'Assignment')}
            </button>
          </form>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed p-12 rounded-xl text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">{t('assignment.submissions_closed')}</p>
          </div>
        )}
      </div>
    );
  }

  // If in review mode
  if (activeReview) {
    const targetSubmission = submissions.find(s => s.id === activeReview.submissionId);
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{t('assignment.reviewing_peer')}</h1>
            <Breadcrumbs />
          </div>
          <button onClick={() => setActiveReview(null)} className="text-gray-500 hover:underline">{t('common.cancel')}</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Peer Work */}
          <div className="bg-white p-6 rounded-xl border h-fit sticky top-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">{t('assignment.peer_submission')}</h3>
            <div className="prose max-w-none text-gray-800 whitespace-pre-wrap">
              {targetSubmission?.content?.text}
            </div>
          </div>

          {/* Rubric Form */}
          <form onSubmit={handleReviewSubmit} className="space-y-6">
            <div className="bg-white p-6 rounded-xl border space-y-6">
              <h3 className="text-lg font-bold">{t('assignment.rubric')}</h3>
              {assignment.rubric.map((item) => (
                <div key={item.id} className="space-y-3">
                  <label className="font-medium text-gray-700">{item.question}</label>
                  {item.type === 'stars' ? (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewForm(prev => ({ ...prev, ratings: { ...prev.ratings, [item.id]: star } }))}
                          className={`p-2 rounded-lg border transition-colors ${reviewForm.ratings[item.id] === star ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-gray-400 hover:border-indigo-300'}`}
                        >
                          <Star className={`w-6 h-6 ${reviewForm.ratings[item.id] === star ? 'fill-current' : ''}`} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {item.options.map((opt, i) => (
                        <label key={i} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name={`rubric-${item.id}`}
                            value={i + 1}
                            checked={reviewForm.ratings[item.id] === (i + 1)}
                            onChange={() => setReviewForm(prev => ({ ...prev, ratings: { ...prev.ratings, [item.id]: (i + 1) } }))}
                            className="w-4 h-4 text-indigo-600"
                          />
                          <span className="text-sm">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white p-6 rounded-xl border space-y-4">
              <h3 className="text-lg font-bold">{t('assignment.feedback')}</h3>
              <textarea
                value={reviewForm.feedback}
                onChange={(e) => setReviewForm(prev => ({ ...prev, feedback: e.target.value }))}
                className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder={t('assignment.type_response')}
                required={assignment.mandatory_feedback}
              />
              {assignment.mandatory_feedback && (
                <p className={`text-xs ${reviewForm.feedback.length < assignment.min_char_count ? 'text-red-500' : 'text-green-600'}`}>
                  {t('assignment.char_required', { current: reviewForm.feedback.length, min: assignment.min_char_count })}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={assignment.mandatory_feedback && reviewForm.feedback.length < assignment.min_char_count}
              className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {t('assignment.submit_review')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard View
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl overflow-hidden relative">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold">{assignment.title}</h1>
          <p className="mt-2 text-indigo-100 max-w-xl">{assignment.description}</p>
          <div className="mt-2">
            <Breadcrumbs />
          </div>
          <div className="mt-6 flex items-center gap-4">
            <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-sm">
              <CheckCircle className="w-4 h-4" />
              {t('assignment.work_submitted')}
            </span>
            <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-sm">
              <Users className="w-4 h-4" />
              {t('assignment.reviews_done', { completed: reviewsCompleted, needed: reviewsNeeded })}
            </span>
          </div>
        </div>
        <BookOpen className="absolute -bottom-10 -right-10 w-64 h-64 text-white/10 rotate-12" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Review Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              {t('assignment.peer_reviews')}
            </h2>
            <button
              onClick={() => runDistribution(assignment.id)}
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title={t('assignment.check_new_tasks')}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {!canReview ? (
            <div className="bg-orange-50 border border-orange-100 p-6 rounded-xl flex items-start gap-4 text-orange-800">
              <Clock className="w-6 h-6 shrink-0 mt-1" />
              <div>
                <p className="font-bold">{t('assignment.waiting_room')}</p>
                <p className="text-sm opacity-90">
                  {t('assignment.waiting_room_desc', { count: assignment.review_start_threshold, current: submissions.length })}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {myReviewsGiven.map((rev, i) => (
                <div key={rev.id} className="bg-white border rounded-xl p-4 flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-medium">{t('assignment.review_number', { count: i + 1 })}</p>
                    <p className={`text-sm ${rev.status === 'completed' ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                      {rev.status === 'completed' ? `✓ ${t('common.completed')}` : t('common.pending')}
                    </p>
                  </div>
                  {rev.status !== 'completed' && (
                    <button
                      onClick={() => setActiveReview(rev)}
                      disabled={assignment.allowReviews === false}
                      className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {assignment.allowReviews === false ? t('common.status').replace('Status', 'Closed') : t('assignment.start_review')}
                    </button>
                  )}
                </div>
              ))}
              {myReviewsGiven.length < reviewsNeeded && (
                <div className="bg-gray-50 border-2 border-dashed p-4 rounded-xl text-center text-gray-500 text-sm">
              {assignment.allowReviews === false ? t('assignment.reviews_closed') : t('assignment.wait_more_peers')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            {t('assignment.feedback_received')}
          </h2>
          <div className="space-y-4">
            {myReviewsReceived.map((rev, i) => (
              <div key={rev.id} className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-bold text-gray-400 uppercase">{t('assignment.review_number', { count: i + 1 })}</p>
                  <div className="flex text-yellow-400">
                    {/* Just showing one star as indicator, or could average */}
                    <Star className="w-4 h-4 fill-current" />
                  </div>
                </div>
                <p className="text-gray-700 italic text-sm border-l-4 border-indigo-100 pl-4 py-1">
                  "{rev.feedback}"
                </p>

                {/* Meta-Review / Agreement */}
                <div className="pt-4 border-t space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('assignment.do_you_agree')}</p>
                  {!rev.agreement?.status ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMetaReview(rev.id, 'agree', metaReviewNotes[rev.id] || '')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> {t('assignment.agree')}
                        </button>
                        <button
                          onClick={() => handleMetaReview(rev.id, 'disagree', metaReviewNotes[rev.id] || '')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" /> {t('assignment.disagree')}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder={t('assignment.add_note')}
                        value={metaReviewNotes[rev.id] || ''}
                        onChange={(e) => setMetaReviewNotes({ ...metaReviewNotes, [rev.id]: e.target.value })}
                        className="w-full text-xs px-2 py-1.5 border rounded outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${rev.agreement.status === 'agree' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {rev.agreement.status === 'agree' ? t('assignment.you_agreed') : t('assignment.you_disagreed')}
                      </span>
                      {rev.agreement.note && <span className="text-xs text-gray-500 italic">"{rev.agreement.note}"</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {myReviewsReceived.length === 0 && (
              <div className="py-12 text-center bg-gray-50 border-2 border-dashed rounded-xl text-gray-400 text-sm">
                {t('assignment.no_feedback')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
