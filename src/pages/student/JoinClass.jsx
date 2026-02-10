import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function JoinClass() {
  const { t } = useTranslation();
  const { classId } = useParams();
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('joining'); // joining, approved, pending, error
  const [className, setClassName] = useState('');

  useEffect(() => {
    const processJoin = async () => {
      if (!user || !userData) return;

      try {
        const classRef = doc(db, 'classes', classId);
        const classSnap = await getDoc(classRef);

        if (!classSnap.exists()) {
          setStatus('error');
          setLoading(false);
          return;
        }

        const classData = classSnap.data();
        setClassName(classData.name);

        const email = user.email.toLowerCase();
        const isPreApproved = classData.studentEmails?.includes(email);

        if (isPreApproved) {
          // Add to studentUids if not already there
          if (!classData.studentUids?.includes(user.uid)) {
            await updateDoc(classRef, {
              studentUids: arrayUnion(user.uid)
            });
          }
          setStatus('approved');
        } else {
          // Check if already pending
          const isPending = classData.pendingStudents?.some(s => s.uid === user.uid);
          if (!isPending) {
            await updateDoc(classRef, {
              pendingStudents: arrayUnion({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                joinedAt: new Date().toISOString()
              })
            });
          }
          setStatus('pending');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
      } finally {
        setLoading(false);
      }
    };

    processJoin();
  }, [classId, user, userData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="mt-4 text-gray-600 font-medium">{t('join.joining')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border shadow-sm text-center">
      {status === 'approved' && (
        <>
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">{t('join.success_title')}</h1>
          <p className="text-gray-600 mt-2">{t('join.success_desc', { name: className })}</p>
          <button
            onClick={() => navigate(`/student/class/${classId}`)}
            className="w-full mt-6 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700"
          >
            {t('join.go_to_class')}
          </button>
        </>
      )}

      {status === 'pending' && (
        <>
          <Loader2 className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">{t('join.request_sent')}</h1>
          <p className="text-gray-600 mt-2">
            {t('join.request_desc', { name: className })}
          </p>
          <button
            onClick={() => navigate('/student')}
            className="w-full mt-6 bg-gray-100 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-200"
          >
            {t('join.back_to_dashboard')}
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">{t('join.error_title')}</h1>
          <p className="text-gray-600 mt-2">{t('join.error_desc')}</p>
          <button
            onClick={() => navigate('/student')}
            className="w-full mt-6 bg-gray-100 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-200"
          >
            {t('join.back_to_dashboard')}
          </button>
        </>
      )}
    </div>
  );
}
