import React, { useState, useEffect, useRef } from 'react';
import { EditorContent } from '@tiptap/react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, updateDoc, setDoc, serverTimestamp, increment, writeBatch } from 'firebase/firestore';
import { Send, CheckCircle, Clock, Star, MessageSquare, AlertCircle, RefreshCw, Users, BookOpen, ArrowLeft } from 'lucide-react';
import Breadcrumbs from '../../components/Breadcrumbs';
import RubricDisplay from '../../components/RubricDisplay';
import { useRichTextEditor, EditorToolbar, RichTextRenderer, RichTextInput, stripHtml } from '../../components/RichTextEditor';
import { runDistribution, runTeacherDistribution } from '../../lib/logic';
import { useTranslation } from 'react-i18next';

export default function StudentAssignmentView({ assignment, submissions, reviews, isTestMode, setMockSubmissions, setMockReviews }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isTeacherMode = assignment.mode === 'teacher';
  const myEmail = (user.email || '').toLowerCase();
  const [text, setText] = useState('');
  const textRef = useRef('');
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const [submitting, setSubmitting] = useState(false);
  const [activeReview, setActiveReview] = useState(null);
  const [viewingReview, setViewingReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ ratings: {}, feedback: '' });
  const [highlightedSubmission, setHighlightedSubmission] = useState('');
  const [activeColor, setActiveColor] = useState(null);
  const [isEraserActive, setIsEraserActive] = useState(false);
  const [hoveredRatings, setHoveredRatings] = useState({});
  const [hoveredAgreementRatings, setHoveredAgreementRatings] = useState({});
  const [metaReviewNotes, setMetaReviewNotes] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);

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
      const targetSub = (submissions || []).find(s => s.id === activeReview.submissionId);
      const initialContent = targetSub?.content?.text || '';
      // Wrap plain text in <p> if it's not HTML
      const htmlContent = initialContent.startsWith('<') ? initialContent : `<p>${initialContent}</p>`;
      setHighlightedSubmission(htmlContent);
      setReviewForm({ ratings: {}, feedback: '' });
      setActiveColor(null);
      setIsEraserActive(false);
    }
  }, [activeReview, submissions]);

  const mySubmission = (submissions || []).find(s => s.studentId === user.uid);
  // Texts the current student "owns" (teacher selected their email as a recipient of the evaluation)
  const myOwnedTextIds = isTeacherMode
    ? (submissions || []).filter(s => s.isTeacherText && (s.ownerEmails || []).includes(myEmail)).map(s => s.id)
    : [];
  // In teacher mode the student is a reviewer only, so the "submit work" step is skipped entirely.
  const isSubmitted = isTeacherMode ? true : (mySubmission && mySubmission.status !== 'expected');
  const myReviewsGiven = (reviews || []).filter(r => r.reviewerId === user.uid);
  const myReviewsReceived = isTeacherMode
    ? (reviews || []).filter(r => myOwnedTextIds.includes(r.submissionId) && r.status === 'completed')
    : (reviews || []).filter(r => r.authorId === user.uid && r.status === 'completed');

  useEffect(() => {
    if (!assignment.timeLimit || !mySubmission || isSubmitted) {
      setTimeLeft(null);
      return;
    }

    const timer = setInterval(() => {
      const limit = assignment.timeLimit * 60 * 1000;
      if (mySubmission.writingStartedAt) {
        const start = mySubmission.writingStartedAt.toMillis();
        const now = Date.now();
        const remaining = Math.max(0, start + limit - now);
        setTimeLeft(remaining);

        if (remaining === 0) {
          clearInterval(timer);
          // Auto-submit using ref value
          handleSubmitWork();
        }
      } else {
        setTimeLeft(limit);
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.timeLimit, mySubmission?.writingStartedAt, isSubmitted]);

  useEffect(() => {
    const createPlaceholder = async () => {
      if (!submissions) return;

      // Teacher-provided-texts mode: register the student as a reviewer and pull review tasks.
      if (isTeacherMode) {
        if (user && assignment && !mySubmission) {
          const subId = `${assignment.id}_${user.uid}`;
          if (isTestMode) return;
          try {
            await setDoc(doc(db, 'submissions', subId), {
              assignmentId: assignment.id,
              classId: assignment.classId,
              studentId: user.uid,
              studentName: user.displayName || 'Student',
              email: (user.email || '').toLowerCase(),
              status: 'reviewer',
              isReviewer: true,
              givenReviewsCount: 0,
              givenCompletedCount: 0,
              createdAt: serverTimestamp()
            }, { merge: true });
            await runTeacherDistribution(assignment.id);
          } catch (err) {
            console.error("Reviewer registration error:", err);
          }
        }
        return;
      }

      // Only create placeholder for students if it doesn't exist yet
      if (user && assignment && !mySubmission && assignment.allowSubmissions !== false) {
        const subId = `${assignment.id}_${user.uid}`;
        // With timerStart 'open' the countdown runs from the first page open,
        // so the placeholder itself starts the clock.
        const startTimerNow = !!assignment.timeLimit && assignment.timerStart === 'open';
        if (isTestMode) {
          setMockSubmissions(prev => {
            if (prev.find(s => s.id === subId)) return prev;
            return [...prev, {
              id: subId,
              assignmentId: assignment.id,
              classId: assignment.classId,
              studentId: user.uid,
              studentName: user.displayName || 'Student',
              status: 'expected',
              reviewCount: 0,
              assignedCount: 0,
              givenReviewsCount: 0,
              givenCompletedCount: 0,
              ...(startTimerNow ? { writingStartedAt: { toMillis: () => Date.now() } } : {}),
              createdAt: { toMillis: () => Date.now() }
            }];
          });
          return;
        }
        try {
          await setDoc(doc(db, 'submissions', subId), {
            assignmentId: assignment.id,
            classId: assignment.classId,
            studentId: user.uid,
            studentName: user.displayName || 'Student',
            status: 'expected',
            reviewCount: 0,
            assignedCount: 0,
            givenReviewsCount: 0,
            givenCompletedCount: 0,
            ...(startTimerNow ? { writingStartedAt: serverTimestamp() } : {}),
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Placeholder error:", err);
        }
      }
    };
    createPlaceholder();
  }, [user, assignment, mySubmission, submissions, isTestMode, isTeacherMode, setMockSubmissions]);

  const submittedCount = (submissions || []).filter(s => s.status !== 'expected' && s.status !== 'reviewer').length;
  const canReview = isTeacherMode ? true : submittedCount >= assignment.review_start_threshold;
  const reviewsNeeded = assignment.reviews_per_submission;
  const reviewsCompleted = myReviewsGiven.filter(r => r.status === 'completed').length;

  // Distribution normally runs when someone submits or completes a review.
  // If that student closed the browser before it finished, tasks stay stuck
  // until someone hits refresh. Run it once per page load, but only when this
  // student is actually missing a task, so idle page opens stay cheap.
  const distributionAttempted = useRef(false);
  useEffect(() => {
    if (isTestMode || distributionAttempted.current) return;
    if (!submissions || !reviews) return;
    if (assignment.allowReviews === false || !canReview || !isSubmitted) return;

    let missingTask;
    if (isTeacherMode) {
      const hasPending = myReviewsGiven.some(r => r.status !== 'completed');
      const myReviewedIds = myReviewsGiven.map(r => r.submissionId);
      const availableText = submissions.some(s =>
        s.isTeacherText &&
        !myReviewedIds.includes(s.id) &&
        !(s.ownerEmails || []).includes(myEmail) &&
        (s.assignedCount || 0) < assignment.reviews_per_submission
      );
      missingTask = !hasPending && availableText;
    } else {
      const target = Math.min(reviewsCompleted + 1, reviewsNeeded);
      missingTask = myReviewsGiven.length < target;
    }

    if (missingTask) {
      distributionAttempted.current = true;
      (isTeacherMode ? runTeacherDistribution(assignment.id) : runDistribution(assignment.id))
        .catch(err => console.error('Distribution catch-up error:', err));
    }
  }, [submissions, reviews, isTestMode, isTeacherMode, canReview, isSubmitted, assignment, myEmail, myReviewsGiven, reviewsCompleted, reviewsNeeded]);

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmitWork = async (e) => {
    if (e) e.preventDefault();

    const currentText = textRef.current;
    const plainText = currentText.replace(/<[^>]*>/g, '').trim();

    // Allow empty submission for auto-submit if time runs out, but check trim for manual
    if (!e && !plainText) {
       // auto-submitting empty text is allowed
    } else if (e && !plainText) {
       return;
    }

    setSubmitting(true);
    try {
      const subId = `${assignment.id}_${user.uid}`;

      if (isTestMode) {
        // 1. Update own submission
        setMockSubmissions(prev => prev.map(s => s.id === subId ? {
          ...s,
          content: { text: currentText },
          status: 'submitted',
          updatedAt: { toMillis: () => Date.now() }
        } : s));

        // 2. Create mock peer submission
        const peerSubId = `peer_${assignment.id}`;
        const peerSub = {
          id: peerSubId,
          assignmentId: assignment.id,
          classId: assignment.classId,
          studentId: 'peer_uid',
          studentName: 'Spolužák (Test)',
          content: { text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.' },
          status: 'submitted',
          reviewCount: 1,
          assignedCount: 1,
          createdAt: { toMillis: () => Date.now() - 10000 }
        };

        setMockSubmissions(prev => {
           if (prev.find(s => s.id === peerSubId)) return prev;
           return [...prev, peerSub];
        });

        // 3. Create review assigned to teacher
        const reviewToMe = {
          id: `review_to_${user.uid}`,
          assignmentId: assignment.id,
          submissionId: peerSubId,
          reviewerId: user.uid,
          reviewerName: user.displayName,
          authorId: 'peer_uid',
          status: 'assigned',
          ratings: {},
          feedback: '',
          createdAt: { toMillis: () => Date.now() }
        };

        // 4. Create completed review FOR teacher's work
        const reviewForMe = {
          id: `review_for_${user.uid}`,
          assignmentId: assignment.id,
          submissionId: subId,
          reviewerId: 'peer_uid',
          reviewerName: 'Spolužák (Test)',
          authorId: user.uid,
          status: 'completed',
          ratings: Object.fromEntries(assignment.rubric.map(r => [r.id, r.type === 'stars' ? 4 : (r.type === 'passfail' ? true : 1)])),
          feedback: '<p>Skvělá práce! Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>',
          highlightedSubmission: `<p>${currentText}</p>`,
          completedAt: { toMillis: () => Date.now() },
          createdAt: { toMillis: () => Date.now() - 5000 }
        };

        setMockReviews([reviewToMe, reviewForMe]);
        setSubmitting(false);
        return;
      }

      await setDoc(doc(db, 'submissions', subId), {
        assignmentId: assignment.id,
        classId: assignment.classId,
        studentId: user.uid,
        studentName: user.displayName,
        content: { text: currentText },
        status: 'submitted',
        submittedAt: serverTimestamp(),
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

    // For validation, strip HTML tags to count real characters
    const plainFeedback = stripHtml(reviewForm.feedback);

    if (assignment.mandatory_feedback && plainFeedback.length < assignment.min_char_count) {
      alert(t('assignment.char_required').replace('{{current}}', plainFeedback.length).replace('{{min}}', assignment.min_char_count));
      return;
    }

    try {
      if (isTestMode) {
        setMockReviews(prev => prev.map(r => r.id === activeReview.id ? {
          ...r,
          status: 'completed',
          ratings: reviewForm.ratings,
          feedback: reviewForm.feedback,
          highlightedSubmission: highlightedSubmission,
          completedAt: { toMillis: () => Date.now() }
        } : r));

        setMockSubmissions(prev => prev.map(s => s.id === activeReview.submissionId ? {
          ...s,
          reviewCount: (s.reviewCount || 0) + 1
        } : s.id === `${assignment.id}_${user.uid}` ? {
          ...s,
          givenCompletedCount: (s.givenCompletedCount || 0) + 1
        } : s));

        setActiveReview(null);
        setReviewForm({ ratings: {}, feedback: '' });
        return;
      }

      // One atomic batch: the review itself plus both counters, so a failure
      // halfway through can no longer leave the counters out of sync
      const batch = writeBatch(db);
      batch.update(doc(db, 'reviews', activeReview.id), {
        status: 'completed',
        ratings: reviewForm.ratings,
        feedback: reviewForm.feedback,
        highlightedSubmission: highlightedSubmission,
        completedAt: serverTimestamp()
      });
      batch.update(doc(db, 'submissions', activeReview.submissionId), {
        reviewCount: increment(1)
      });
      batch.update(doc(db, 'submissions', `${assignment.id}_${user.uid}`), {
        givenCompletedCount: increment(1)
      });
      await batch.commit();

      // Trigger next review assignment
      if (isTeacherMode) {
        await runTeacherDistribution(assignment.id);
      } else {
        await runDistribution(assignment.id);
      }

      setActiveReview(null);
      setReviewForm({ ratings: {}, feedback: '' });
    } catch (err) {
      console.error(err);
      alert(t('assignment.error_saving_review'));
    }
  };

  const handleMetaReview = async (reviewId, rating, note) => {
    if (isTestMode) {
      setMockReviews(prev => prev.map(r => r.id === reviewId ? {
        ...r,
        agreement: { rating, note, updatedAt: { toMillis: () => Date.now() } }
      } : r));
      return;
    }
    await updateDoc(doc(db, 'reviews', reviewId), {
      agreement: { rating, note, updatedAt: serverTimestamp() }
    });
  };

  const handleTextChange = async (newHtml) => {
    setText(newHtml);

    // In 'open' mode the clock already started with the placeholder
    if (assignment.timeLimit && assignment.timerStart !== 'open' && !mySubmission?.writingStartedAt) {
      const subId = `${assignment.id}_${user.uid}`;
      if (isTestMode) {
        setMockSubmissions(prev => prev.map(s => s.id === subId ? {
          ...s,
          writingStartedAt: { toMillis: () => Date.now() }
        } : s));
        return;
      }
      try {
        await updateDoc(doc(db, 'submissions', subId), {
          writingStartedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error starting timer:", err);
      }
    }
  };

  // UI rendering based on status
  if (!isSubmitted) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 shadow-sm">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
            <div className="text-gray-500 mb-1">
              <RichTextRenderer content={assignment.description} />
            </div>
            <Breadcrumbs />
          </div>
        </div>

        {assignment.allowSubmissions !== false ? (
          <form onSubmit={handleSubmitWork} className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">{t('assignment.submit_work')}</h2>
              {timeLeft !== null && (
                <div className={`flex items-center gap-2 font-mono font-bold px-3 py-1.5 rounded-lg border ${timeLeft < 60000 ? 'text-red-600 border-red-200 bg-red-50 animate-pulse' : 'text-indigo-600 border-indigo-100 bg-indigo-50'}`}>
                  <Clock className="w-4 h-4" />
                  {t('assignment.time_remaining', { time: formatTime(timeLeft) })}
                </div>
              )}
            </div>
            <RichTextInput
              content={text}
              onChange={handleTextChange}
              placeholder={t('assignment.type_response')}
              editorClassName="min-h-[300px] p-4"
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
    const feedbackLength = stripHtml(reviewForm.feedback).length;
    return (
      <div className="space-y-8 pb-20" style={{
        '--selection-color': isEraserActive ? '#cbd5e1' : (activeColor || '#bfdbfe'),
        '--highlight-color': activeColor || 'transparent'
      }}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{isTeacherMode ? t('assignment.review_text') : t('assignment.reviewing_peer')}</h1>
            <Breadcrumbs />
          </div>
          <button onClick={() => setActiveReview(null)} className="text-gray-500 hover:underline">{t('common.cancel')}</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Peer Work */}
          <div className="bg-white rounded-xl border h-fit lg:sticky lg:top-8 overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">{isTeacherMode ? t('assignment.reviewed_text') : t('assignment.peer_submission')}</h3>
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
                  <p className={`text-xs ${feedbackLength < assignment.min_char_count ? 'text-red-500' : 'text-green-600'}`}>
                    {t('assignment.char_required', {
                      current: feedbackLength,
                      min: assignment.min_char_count
                    })}
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={assignment.mandatory_feedback && feedbackLength < assignment.min_char_count}
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
    // A review is "received" if the current user is the author/owner of the work being reviewed
    const isReceived = isTeacherMode
      ? myOwnedTextIds.includes(viewingReview.submissionId)
      : viewingReview.authorId === user.uid;

    const targetSubmissionId = viewingReview.submissionId;
    // In teacher mode the reviewed item is always the teacher-provided text.
    // In peer mode: for received reviews show my own submission, otherwise the peer's.
    const targetSubmission = isTeacherMode
      ? (submissions || []).find(s => s.id === targetSubmissionId)
      : (isReceived ? mySubmission : (submissions || []).find(s => s.id === targetSubmissionId));

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
               <div className="text-gray-600 text-sm italic">
                  <RichTextRenderer content={assignment.description} />
               </div>
            </div>

            <div className="bg-white p-6 rounded-xl border">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">
                {isTeacherMode ? t('assignment.reviewed_text') : (isReceived ? t('assignment.your_submission') : t('assignment.peer_submission'))}
              </h3>
              <div className="prose max-w-none text-gray-800">
                <RichTextRenderer content={viewingReview.highlightedSubmission || targetSubmission?.content?.text || ''} />
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

            {viewingReview.agreement?.rating && (
              <div className="bg-white p-6 rounded-xl border space-y-4">
                 <h3 className="text-sm font-bold text-gray-500 uppercase">{t('assignment.agreement_status')}</h3>
                 <div className="flex items-center gap-4">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${star <= viewingReview.agreement.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                        />
                      ))}
                    </div>
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
            <div className="text-gray-500 mb-1">
              <RichTextRenderer content={assignment.description} />
            </div>
            <Breadcrumbs />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isTeacherMode && (
            <span className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full text-sm font-semibold">
              <CheckCircle className="w-4 h-4" />
              {t('assignment.work_submitted')}
            </span>
          )}
          <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-full text-sm font-semibold">
            <Users className="w-4 h-4" />
            {isTeacherMode
              ? `${reviewsCompleted} ${t('assignment.reviews_completed').toLowerCase()}`
              : t('assignment.reviews_done', { completed: reviewsCompleted, needed: reviewsNeeded })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Review Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              {isTeacherMode ? t('assignment.texts_to_review') : t('assignment.peer_reviews')}
            </h2>
            <button
              onClick={() => !isTestMode && (isTeacherMode ? runTeacherDistribution(assignment.id) : runDistribution(assignment.id))}
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
                        {assignment.allowReviews === false ? t('common.closed') : (isTeacherMode ? t('assignment.review_text') : t('assignment.start_review'))}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isTeacherMode ? (
                !myReviewsGiven.some(r => r.status !== 'completed') && (
                  <div className="bg-gray-50 border-2 border-dashed p-4 rounded-xl text-center text-gray-500 text-sm">
                    {assignment.allowReviews === false ? t('assignment.reviews_closed') : t('assignment.no_more_texts')}
                  </div>
                )
              ) : (
                myReviewsGiven.length < reviewsNeeded && (
                  <div className="bg-gray-50 border-2 border-dashed p-4 rounded-xl text-center text-gray-500 text-sm">
                    {assignment.allowReviews === false ? t('assignment.reviews_closed') : t('assignment.wait_more_peers')}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Feedback Section */}
        {(!isTeacherMode || myOwnedTextIds.length > 0) && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            {isTeacherMode ? t('assignment.your_text_feedback') : t('assignment.feedback_received')}
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
                  {!rev.agreement?.rating ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div
                          className="flex gap-1"
                          onMouseLeave={() => setHoveredAgreementRatings(prev => ({ ...prev, [rev.id]: 0 }))}
                        >
                          {[1, 2, 3, 4, 5].map((star) => {
                            const isHovered = star <= (hoveredAgreementRatings[rev.id] || 0);
                            return (
                              <button
                                key={star}
                                type="button"
                                onMouseEnter={() => setHoveredAgreementRatings(prev => ({ ...prev, [rev.id]: star }))}
                                onClick={() => handleMetaReview(rev.id, star, metaReviewNotes[rev.id] || '')}
                                className="focus:outline-none transition-transform hover:scale-110"
                                title={star === 1 ? t('assignment.strongly_disagree') : star === 5 ? t('assignment.strongly_agree') : ''}
                              >
                                <Star
                                  className={`w-6 h-6 ${isHovered ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                                />
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 font-medium uppercase px-0.5">
                          <span>{t('assignment.strongly_disagree')}</span>
                          <span>{t('assignment.strongly_agree')}</span>
                        </div>
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
                    <div className="flex items-center gap-3">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${star <= rev.agreement.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                          />
                        ))}
                      </div>
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
        )}
      </div>
    </div>
  );
}
