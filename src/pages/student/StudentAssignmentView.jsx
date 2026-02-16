import React, { useState, useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Send, CheckCircle, Clock, Star, MessageSquare, AlertCircle, ThumbsUp, ThumbsDown, RefreshCw, Users, BookOpen, ArrowLeft } from 'lucide-react';
import Breadcrumbs from '../../components/Breadcrumbs';
import RubricDisplay from '../../components/RubricDisplay';
import { useRichTextEditor, EditorToolbar, RichTextRenderer } from '../../components/RichTextEditor';
import { runDistribution } from '../../lib/logic';
import { useTranslation } from 'react-i18next';

export default function StudentAssignmentView({ assignment, submissions, reviews }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeReview, setActiveReview] = useState(null);
  const [viewingReview, setViewingReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ ratings: {}, feedback: '' });
  const [highlightedSubmission, setHighlightedSubmission] = useState('');
  const [activeColor, setActiveColor] = useState(null);
  const [isEraserActive, setIsEraserActive] = useState(false);
  const [hoveredRatings, setHoveredRatings] = useState({});
  const [metaReviewNotes, setMetaReviewNotes] = useState({});

  // Tiptap editors for review mode
  const submissionEditor = useRichTextEditor({
    content: highlightedSubmission,
    onChange: setHighlightedSubmission,
    activeColor,
    isEraserActive,
    highlightOnly: true,
    className: 'p-4 min-h-[200px]'
  });

  const feedbackEditor = useRichTextEditor({
    content: reviewForm.feedback,
    onChange: (html) => setReviewForm(prev => ({ ...prev, feedback: html })),
    activeColor,
    isEraserActive,
    className: 'p-4 min-h-[150px]'
  });

  // Reset editors when active review changes
  useEffect(() => {
    if (activeReview) {
      const targetSub = submissions.find(s => s.id === activeReview.submissionId);
      const initialContent = targetSub?.content?.text || '';
      // Wrap plain text in <p> if it's not HTML
      const htmlContent = initialContent.startsWith('<') ? initialContent : `<p>${initialContent}</p>`;
      setHighlightedSubmission(htmlContent);
      setReviewForm({ ratings: {}, feedback: '' });
      setActiveColor(null);
      setIsEraserActive(false);
    }
  }, [activeReview?.id]);

  const mySubmission = submissions.find(s => s.studentId === user.uid);
  const myReviewsGiven = reviews.filter(r => r.reviewerId === user.uid);
  const myReviewsReceived = reviews.filter(r => r.authorId === user.uid && r.status === 'completed');

  useEffect(() => {
    const createPlaceholder = async () => {
      // Only create placeholder for students if it doesn't exist yet
      if (user && assignment && !mySubmission && assignment.allowSubmissions !== false) {
        const subId = `${assignment.id}_${user.uid}`;
        try {
          await setDoc(doc(db, 'submissions', subId), {
            assignmentId: assignment.id,
            classId: assignment.classId,
            studentId: user.uid,
            studentName: user.displayName || 'Student',
            status: 'expected',
            reviewCount: 0,
            assignedCount: 0,
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Placeholder error:", err);
        }
      }
    };
    createPlaceholder();
  }, [user, assignment, !!mySubmission]);

  const submittedCount = submissions.filter(s => s.status !== 'expected').length;
  const canReview = submittedCount >= assignment.review_start_threshold;
  const reviewsNeeded = assignment.reviews_per_submission;
  const reviewsCompleted = myReviewsGiven.filter(r => r.status === 'completed').length;

  const handleSubmitWork = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const subId = `${assignment.id}_${user.uid}`;
      await setDoc(doc(db, 'submissions', subId), {
        assignmentId: assignment.id,
        classId: assignment.classId,
        studentId: user.uid,
        studentName: user.displayName,
        content: { text },
        status: 'submitted',
        updatedAt: serverTimestamp()
      }, { merge: true });

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

    // For validation, we might want to strip HTML tags to count real characters
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = reviewForm.feedback;
    const plainFeedback = tempDiv.textContent || tempDiv.innerText || '';

    if (assignment.mandatory_feedback && plainFeedback.length < assignment.min_char_count) {
      alert(t('assignment.char_required').replace('{{current}}', plainFeedback.length).replace('{{min}}', assignment.min_char_count));
      return;
    }

    try {
      await updateDoc(doc(db, 'reviews', activeReview.id), {
        status: 'completed',
        ratings: reviewForm.ratings,
        feedback: reviewForm.feedback,
        highlightedSubmission: highlightedSubmission,
        completedAt: serverTimestamp()
      });

      // Update the submission's reviewCount
      const subRef = doc(db, 'submissions', activeReview.submissionId);
      await updateDoc(subRef, {
        reviewCount: (submissions.find(s => s.id === activeReview.submissionId)?.reviewCount || 0) + 1
      });

      // Trigger next review assignment
      await runDistribution(assignment.id);

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
  const isSubmitted = mySubmission && mySubmission.status !== 'expected';

  if (!isSubmitted) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 shadow-sm">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
            <p className="text-gray-500 mb-1">{assignment.description}</p>
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
              {submitting ? t('common.loading') : t('assignment.submit_assignment')}
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
    return (
      <div className="space-y-8 pb-20" style={{
        '--selection-color': isEraserActive ? '#cbd5e1' : (activeColor || '#bfdbfe'),
        '--highlight-color': activeColor || 'transparent'
      }}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{t('assignment.reviewing_peer')}</h1>
            <Breadcrumbs />
          </div>
          <button onClick={() => setActiveReview(null)} className="text-gray-500 hover:underline">{t('common.cancel')}</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Peer Work */}
          <div className="bg-white rounded-xl border h-fit lg:sticky lg:top-8 overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t('assignment.peer_submission')}</h3>
            </div>
            <div className="p-2">
               <EditorContent editor={submissionEditor} />
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
                    <div className="flex gap-2" onMouseLeave={() => setHoveredRatings(prev => ({ ...prev, [item.id]: 0 }))}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const displayValue = hoveredRatings[item.id] || reviewForm.ratings[item.id] || 0;
                        const isActive = star <= displayValue;

                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewForm(prev => ({ ...prev, ratings: { ...prev.ratings, [item.id]: star } }))}
                            onMouseEnter={() => setHoveredRatings(prev => ({ ...prev, [item.id]: star }))}
                            className={`p-2 rounded-lg border transition-colors ${isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-gray-400 hover:border-indigo-300'}`}
                          >
                            <Star className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} />
                          </button>
                        );
                      })}
                    </div>
                  ) : item.type === 'passfail' ? (
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`rubric-${item.id}`}
                        checked={!!reviewForm.ratings[item.id]}
                        onChange={(e) => setReviewForm(prev => ({ ...prev, ratings: { ...prev.ratings, [item.id]: e.target.checked } }))}
                        className="w-6 h-6 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <label htmlFor={`rubric-${item.id}`} className="text-sm font-medium text-gray-600 cursor-pointer">
                        {reviewForm.ratings[item.id] ? t('common.pass') : t('common.fail')}
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {item.options.map((opt, i) => {
                        const text = typeof opt === 'string' ? opt : opt.value;
                        return (
                          <label key={i} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                            <input
                              type="radio"
                              name={`rubric-${item.id}`}
                              value={i + 1}
                              checked={reviewForm.ratings[item.id] === (i + 1)}
                              onChange={() => setReviewForm(prev => ({ ...prev, ratings: { ...prev.ratings, [item.id]: (i + 1) } }))}
                              className="w-4 h-4 text-indigo-600"
                            />
                            <span className="text-sm">{text}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border space-y-4 overflow-hidden relative">
              <div className="p-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-20">
                <h3 className="text-lg font-bold px-2">{t('assignment.feedback')}</h3>
                <EditorToolbar
                  editors={[submissionEditor, feedbackEditor]}
                  activeColor={activeColor}
                  setActiveColor={setActiveColor}
                  isEraserActive={isEraserActive}
                  setIsEraserActive={setIsEraserActive}
                />
              </div>
              <div className="p-2">
                <EditorContent editor={feedbackEditor} />
              </div>
              {assignment.mandatory_feedback && (
                <div className="px-6 pb-6">
                  <p className={`text-xs ${(() => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = reviewForm.feedback;
                    const len = (tempDiv.textContent || tempDiv.innerText || '').length;
                    return len < assignment.min_char_count ? 'text-red-500' : 'text-green-600';
                  })()}`}>
                    {t('assignment.char_required', {
                      current: (() => {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = reviewForm.feedback;
                        return (tempDiv.textContent || tempDiv.innerText || '').length;
                      })(),
                      min: assignment.min_char_count
                    })}
                  </p>
                </div>
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

  if (viewingReview) {
    // A review is "received" if the current user is the author of the work being reviewed
    const isReceived = viewingReview.authorId === user.uid;

    const targetSubmissionId = viewingReview.submissionId;
    // For received reviews, show my own submission. For given reviews, show the peer's submission.
    const targetSubmission = isReceived ? mySubmission : submissions.find(s => s.id === targetSubmissionId);

    return (
      <div className="space-y-8 pb-20">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
             <button onClick={() => setViewingReview(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ArrowLeft className="w-6 h-6 text-gray-600" />
             </button>
             <div>
                <h1 className="text-2xl font-bold">
                  {isReceived ? t('assignment.review_received_detail') : t('assignment.review_given_detail')}
                </h1>
                <Breadcrumbs />
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Submission and Instructions */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border">
               <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-2">{t('assignment.instructions')}</h3>
               <p className="text-gray-600 text-sm italic">{assignment.description}</p>
            </div>

            <div className="bg-white p-6 rounded-xl border">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">
                {isReceived ? t('assignment.your_submission') : t('assignment.peer_submission')}
              </h3>
              <div className="prose max-w-none text-gray-800">
                {viewingReview.highlightedSubmission ? (
                  <RichTextRenderer content={viewingReview.highlightedSubmission} />
                ) : (
                  <div className="whitespace-pre-wrap">{targetSubmission?.content?.text}</div>
                )}
              </div>
            </div>
          </div>

          {/* Evaluation Details */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border space-y-6">
              <h3 className="text-lg font-bold">{t('assignment.rubric')}</h3>
              <RubricDisplay rubric={assignment.rubric} ratings={viewingReview.ratings} />
            </div>

            <div className="bg-white p-6 rounded-xl border space-y-4">
              <h3 className="text-lg font-bold">{t('assignment.feedback')}</h3>
              <div className="bg-gray-50 p-4 rounded-lg text-gray-700 border border-dashed text-sm">
                <RichTextRenderer content={viewingReview.feedback} />
              </div>
            </div>

            {viewingReview.agreement?.status && (
              <div className="bg-white p-6 rounded-xl border space-y-4">
                 <h3 className="text-sm font-bold text-gray-500 uppercase">{t('assignment.agreement_status')}</h3>
                 <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${viewingReview.agreement.status === 'agree' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {viewingReview.agreement.status === 'agree' ? t('assignment.you_agreed') : t('assignment.you_disagreed')}
                    </span>
                    {viewingReview.agreement.note && (
                      <span className="text-sm text-gray-500 italic">— "{viewingReview.agreement.note}"</span>
                    )}
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dashboard View
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 shadow-sm">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
            <p className="text-gray-500 mb-1">{assignment.description}</p>
            <Breadcrumbs />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full text-sm font-semibold">
            <CheckCircle className="w-4 h-4" />
            {t('assignment.work_submitted')}
          </span>
          <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-full text-sm font-semibold">
            <Users className="w-4 h-4" />
            {t('assignment.reviews_done', { completed: reviewsCompleted, needed: reviewsNeeded })}
          </span>
        </div>
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
                  {t('assignment.waiting_room_desc', { count: assignment.review_start_threshold, current: submittedCount })}
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
                  <div className="flex gap-2">
                    {rev.status === 'completed' && (
                      <button
                        onClick={() => setViewingReview(rev)}
                        className="text-indigo-600 border border-indigo-200 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors"
                      >
                        {t('assignment.view_detail')}
                      </button>
                    )}
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
                  <button
                    onClick={() => setViewingReview(rev)}
                    className="text-indigo-600 border border-indigo-200 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors"
                  >
                    {t('assignment.view_detail')}
                  </button>
                </div>

                <RubricDisplay rubric={assignment.rubric} ratings={rev.ratings} />

                <div className="text-gray-700 text-sm border-l-4 border-indigo-100 pl-4 py-1">
                  <RichTextRenderer content={rev.feedback} />
                </div>

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
