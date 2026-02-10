import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp } from 'firebase/firestore';
import { Users, BookOpen, Plus, Check, X, Clipboard, ExternalLink } from 'lucide-react';
import Breadcrumbs from '../../components/Breadcrumbs';
import { useTranslation } from 'react-i18next';

export default function ClassDetails() {
  const { t } = useTranslation();
  const { classId } = useParams();
  const { user, userData } = useAuth();
  const [classInfo, setClassInfo] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classId) return;

    const unsubClass = onSnapshot(doc(db, 'classes', classId), (doc) => {
      if (doc.exists()) {
        setClassInfo({ id: doc.id, ...doc.data() });
      }
      setLoading(false);
    });

    const q = query(collection(db, 'assignments'), where('classId', '==', classId));
    const unsubAssignments = onSnapshot(q, (snapshot) => {
      setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubClass();
      unsubAssignments();
    };
  }, [classId]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentEmail.trim()) return;
    await updateDoc(doc(db, 'classes', classId), {
      studentEmails: arrayUnion(newStudentEmail.trim().toLowerCase())
    });
    setNewStudentEmail('');
  };

  const handleApproveStudent = async (pendingStudent) => {
    await updateDoc(doc(db, 'classes', classId), {
      pendingStudents: arrayRemove(pendingStudent),
      studentUids: arrayUnion(pendingStudent.uid),
      studentEmails: arrayUnion(pendingStudent.email.toLowerCase())
    });
  };

  const handleRejectStudent = async (pendingStudent) => {
    await updateDoc(doc(db, 'classes', classId), {
      pendingStudents: arrayRemove(pendingStudent)
    });
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}/join/${classId}`;
    navigator.clipboard.writeText(link);
    alert(t('class.link_copied'));
  };

  if (loading) return <div>{t('common.loading')}</div>;
  if (!classInfo) return <div>{t('common.unknown').replace('Unknown', 'Class not found')}</div>;

  const isTeacher = userData?.role === 'teacher';

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{classInfo.name}</h1>
          <p className="text-gray-500 mb-1">{t('class.management')}</p>
          <Breadcrumbs />
        </div>
        {isTeacher && (
          <Link
            to={`/teacher/assignment/new?classId=${classId}`}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>{t('class.new_assignment')}</span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assignments List */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            {t('class.assignments')}
          </h2>
          <div className="grid gap-4">
            {assignments
              .filter(a => isTeacher || a.isVisible !== false)
              .map((assignment) => (
              <Link
                key={assignment.id}
                to={isTeacher ? `/teacher/assignment/${assignment.id}` : `/student/assignment/${assignment.id}`}
                className="p-4 bg-white border rounded-xl hover:shadow-sm transition-shadow flex justify-between items-center"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{assignment.title}</h3>
                  <p className="text-sm text-gray-500">
                    {assignment.reviews_per_submission} {t('assignment.reviews_per_student').toLowerCase()} • {t('assignment.min_submissions').replace('Min Submissions to Start (M)', 'Start at')} {assignment.review_start_threshold} {t('assignment.submissions').toLowerCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    assignment.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {assignment.status === 'open' ? t('common.status').replace('Status', 'Open').toUpperCase() : assignment.status.toUpperCase()}
                  </span>
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            ))}
            {assignments.length === 0 && (
              <div className="text-center py-12 bg-gray-50 border-2 border-dashed rounded-xl text-gray-500">
                {t('class.no_assignments')}
              </div>
            )}
          </div>
        </div>

        {/* Student Management (Teacher Only) */}
        {isTeacher && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('class.students')}
            </h2>

            <div className="bg-white border rounded-xl p-4 space-y-4">
              <div>
                <button
                  onClick={copyJoinLink}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-medium"
                >
                  <Clipboard className="w-4 h-4" />
                  {t('class.copy_link')}
                </button>
              </div>

              <form onSubmit={handleAddStudent} className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('class.add_by_email')}</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    placeholder="student@gmail.com"
                    className="flex-1 px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button type="submit" className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm">
                    {t('class.add')}
                  </button>
                </div>
              </form>

              {/* Pending Approvals */}
              {classInfo.pendingStudents?.length > 0 && (
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">{t('class.pending_approval')}</h3>
                  <div className="space-y-3">
                    {classInfo.pendingStudents.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-orange-50 p-2 rounded-lg border border-orange-100">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.displayName}</p>
                          <p className="text-xs text-gray-500 truncate">{s.email}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleApproveStudent(s)} className="p-1 text-green-600 hover:bg-green-100 rounded">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleRejectStudent(s)} className="p-1 text-red-600 hover:bg-red-100 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enrolled Students */}
              <div className="pt-4 border-t">
                <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">{t('class.enrolled_students')}</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {classInfo.studentEmails?.map((email, idx) => (
                    <div key={idx} className="text-sm text-gray-600 py-1 border-b last:border-0 truncate">
                      {email}
                    </div>
                  ))}
                  {(!classInfo.studentEmails || classInfo.studentEmails.length === 0) && (
                    <p className="text-sm text-gray-400 italic">{t('class.no_students')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
