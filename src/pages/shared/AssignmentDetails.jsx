import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { BookOpen, Users, Star, MessageSquare, Trash2, Edit, AlertCircle, RefreshCw } from 'lucide-react';
import StudentAssignmentView from '../student/StudentAssignmentView';
import { runDistribution } from '../../lib/logic';

export default function AssignmentDetails() {
  const { assignmentId } = useParams();
  const { userData } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

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
    if (!window.confirm('Are you sure you want to delete this review?')) return;
    await deleteDoc(doc(db, 'reviews', reviewId));
  };

  if (loading) return <div>Loading...</div>;
  if (!assignment) return <div>Assignment not found</div>;

  const isTeacher = userData?.role === 'teacher';

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
            <p className="text-gray-500">Teacher Monitoring Dashboard</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runDistribution(assignmentId)}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title="Recalculate and distribute reviews"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Redistribute</span>
          </button>
          <Link
            to={`/teacher/assignment/edit/${assignmentId}`}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4" />
            <span>Edit Assignment</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Submissions</p>
          <p className="text-4xl font-bold mt-2">{submissions.length}</p>
          <p className="text-sm text-gray-400 mt-1">Goal: {assignment.review_start_threshold} to start</p>
        </div>
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Reviews Completed</p>
          <p className="text-4xl font-bold mt-2">{reviews.filter(r => r.status === 'completed').length}</p>
          <p className="text-sm text-gray-400 mt-1">Total assigned: {reviews.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Average Score</p>
          <p className="text-4xl font-bold mt-2">
            {(reviews.reduce((acc, r) => {
              const rValues = Object.values(r.ratings || {});
              if (rValues.length === 0) return acc;
              return acc + (rValues.reduce((a, b) => a + b, 0) / rValues.length);
            }, 0) / (reviews.filter(r => r.status === 'completed').length || 1)).toFixed(1)}
          </p>
          <p className="text-sm text-gray-400 mt-1">Across all criteria</p>
        </div>
      </div>

      {/* Submissions Table */}
      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Student Submissions
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-3 border-b">Student</th>
                <th className="px-6 py-3 border-b">Content</th>
                <th className="px-6 py-3 border-b">Reviews Received</th>
                <th className="px-6 py-3 border-b">Status</th>
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
                      <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">Submitted</span>
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-400">No submissions yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reviews Detail */}
      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            All Reviews
          </h2>
        </div>
        <div className="divide-y">
          {reviews.filter(r => r.status === 'completed').map((review) => (
            <div key={review.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-bold text-indigo-600">Review by {review.reviewerName}</p>
                  <p className="text-xs text-gray-400">Target: {submissions.find(s => s.id === review.submissionId)?.studentName || 'Unknown'}</p>
                </div>
                <button
                  onClick={() => handleDeleteReview(review.id)}
                  className="text-red-500 p-1 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-tight">Ratings</p>
                  {Object.entries(review.ratings || {}).map(([id, val]) => {
                    const criterion = assignment.rubric.find(r => r.id === id);
                    return (
                      <div key={id} className="flex justify-between items-center text-sm">
                        <span>{criterion?.question}</span>
                        <div className="flex items-center gap-1 font-bold text-indigo-600">
                          {val} <Star className="w-3 h-3 fill-current" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-tight">Feedback</p>
                  <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 border italic">
                    {review.feedback}
                  </div>
                  {review.agreement?.status && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded font-bold uppercase ${review.agreement.status === 'agree' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {review.agreement.status}D BY AUTHOR
                      </span>
                      {review.agreement.note && <span className="text-gray-500">— {review.agreement.note}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {reviews.filter(r => r.status === 'completed').length === 0 && (
            <div className="p-12 text-center text-gray-400 italic">No reviews completed yet</div>
          )}
        </div>
      </section>
    </div>
  );
}
