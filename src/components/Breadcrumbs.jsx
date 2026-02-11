import React, { useState, useEffect } from 'react';
import { Link, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronRight, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function Breadcrumbs() {
  const { t } = useTranslation();
  const { classId: classIdParam, assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const classId = classIdParam || searchParams.get('classId');
  const location = useLocation();
  const { userData } = useAuth();

  const [className, setClassName] = useState('');
  const [assignmentName, setAssignmentName] = useState('');
  const [classIdFromAssignment, setClassIdFromAssignment] = useState(null);

  const isTeacher = userData?.role === 'teacher';
  const baseRoute = isTeacher ? '/teacher' : '/student';

  useEffect(() => {
    const fetchData = async () => {
      if (classId) {
        const classSnap = await getDoc(doc(db, 'classes', classId));
        if (classSnap.exists()) {
          setClassName(classSnap.data().name);
        }
      }

      if (assignmentId) {
        const assignmentSnap = await getDoc(doc(db, 'assignments', assignmentId));
        if (assignmentSnap.exists()) {
          const data = assignmentSnap.data();
          setAssignmentName(data.title);
          setClassIdFromAssignment(data.classId);
          if (!classId && data.classId) {
            // If we only have assignmentId, we might need classId to build the link
            const classSnap = await getDoc(doc(db, 'classes', data.classId));
            if (classSnap.exists()) {
              setClassName(classSnap.data().name);
            }
          }
        }
      }
    };

    fetchData();
  }, [classId, assignmentId]);

  // If we are on the dashboard, don't show breadcrumbs or just show "Home"
  if (location.pathname === '/teacher' || location.pathname === '/student' || location.pathname === '/') {
    return null;
  }

  const pathParts = location.pathname.split('/').filter(Boolean);
  const isNewAssignment = location.pathname.includes('/assignment/new');
  const isEditAssignment = location.pathname.includes('/assignment/edit');

  const activeClassId = classId || classIdFromAssignment;

  return (
    <nav className="flex items-center gap-2 text-sm text-gray-500 mt-1 overflow-x-auto whitespace-nowrap">
      <Link
        to={baseRoute}
        className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>{t('common.home')}</span>
      </Link>

      {(activeClassId) && (
        <>
          <ChevronRight className="w-4 h-4 shrink-0" />
          <Link
            to={`${baseRoute}/class/${activeClassId}`}
            className="hover:text-indigo-600 transition-colors max-w-[150px] truncate"
          >
            {className || t('common.loading')}
          </Link>
        </>
      )}

      {assignmentId && (
        <>
          <ChevronRight className="w-4 h-4 shrink-0" />
          <Link
            to={`${baseRoute}/assignment/${assignmentId}`}
            className={`hover:text-indigo-600 transition-colors max-w-[150px] truncate ${!isEditAssignment ? 'font-bold text-gray-900' : ''}`}
          >
            {assignmentName || t('common.loading')}
          </Link>
        </>
      )}

      {isNewAssignment && (
        <>
          <ChevronRight className="w-4 h-4 shrink-0" />
          <span className="font-bold text-gray-900">{t('class.new_assignment')}</span>
        </>
      )}

      {isEditAssignment && (
        <>
          <ChevronRight className="w-4 h-4 shrink-0" />
          <span className="font-bold text-gray-900">{t('common.edit')}</span>
        </>
      )}
    </nav>
  );
}
