import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Users, BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'classes'), where('teacherId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, [user]);

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    await addDoc(collection(db, 'classes'), {
      name: newClassName,
      teacherId: user.uid,
      studentEmails: [],
      studentUids: [],
      pendingStudents: [],
      joinCode: Math.floor(100000 + Math.random() * 900000).toString(),
      createdAt: serverTimestamp()
    });

    setNewClassName('');
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.teacher_title')}</h1>
          <p className="text-gray-500">{t('dashboard.manage_classes')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{t('dashboard.create_class')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes.map((cls) => (
          <Link
            key={cls.id}
            to={`/teacher/class/${cls.id}`}
            className="block bg-white border rounded-xl p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600">
                <BookOpen className="w-6 h-6" />
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{cls.name}</h3>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{(cls.studentEmails?.length || 0) + (cls.studentUids?.length || 0)} {t('dashboard.students_count')}</span>
              </div>
            </div>
          </Link>
        ))}
        {classes.length === 0 && (
          <div className="col-span-full py-12 text-center bg-gray-50 border-2 border-dashed rounded-xl">
            <p className="text-gray-500">{t('dashboard.no_classes_teacher')}</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">{t('dashboard.create_class')}</h2>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('assignment.title_label')}
                </label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Computer Science 101"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {t('dashboard.create_class')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
