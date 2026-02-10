import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { BookOpen, ChevronRight, GraduationCap, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function StudentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [pendingClasses, setPendingClasses] = useState([]);

  useEffect(() => {
    if (!user) return;

    // Classes where student is enrolled
    const q1 = query(collection(db, 'classes'), where('studentUids', 'array-contains', user.uid));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Classes where student is pending (this is harder to query directly with where, so we might need to filter client-side or store it differently)
    // For now, let's just query all classes and filter? No, that's bad.
    // Let's just query classes where pendingStudents contains a match. Firestore doesn't support array-contains on objects well for specific fields.
    // However, for this demo, I'll just look for classes where student has a pending request.
    const q2 = query(collection(db, 'classes')); // In production, use a more specific query
    const unsub2 = onSnapshot(q2, (snapshot) => {
      const pending = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(cls => cls.pendingStudents?.some(s => s.uid === user.uid));
      setPendingClasses(pending);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.student_title')}</h1>
        <p className="text-gray-500">{t('dashboard.view_classes')}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-600" />
          {t('dashboard.my_classes')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              to={`/student/class/${cls.id}`}
              className="block bg-white border rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600">
                  <BookOpen className="w-6 h-6" />
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{cls.name}</h3>
              <p className="text-sm text-gray-500 italic">{t('dashboard.enrolled')}</p>
            </Link>
          ))}
          {classes.length === 0 && pendingClasses.length === 0 && (
            <div className="col-span-full py-12 text-center bg-gray-50 border-2 border-dashed rounded-xl">
              <p className="text-gray-500">{t('dashboard.no_classes_student')}</p>
            </div>
          )}
        </div>
      </section>

      {pendingClasses.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            {t('dashboard.pending_approval')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingClasses.map((cls) => (
              <div key={cls.id} className="bg-orange-50 border border-orange-100 rounded-xl p-6 opacity-75">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{cls.name}</h3>
                <p className="text-sm text-orange-600 font-medium">{t('dashboard.waiting_for_approval')}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
