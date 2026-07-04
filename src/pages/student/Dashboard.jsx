import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, limit } from 'firebase/firestore';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CLASS_COLORS } from '../../lib/constants';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableClassCard({ cls, userSettings, t }) {
  const navigate = useNavigate();
  const wasDragging = React.useRef(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: cls.id });

  React.useEffect(() => {
    if (isDragging) {
      wasDragging.current = true;
    }
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.3 : 1,
  };

  const settings = userSettings?.[cls.id] || {};
  const colorKey = settings.color || cls.color || 'indigo';
  const iconName = settings.icon || cls.icon || 'BookOpen';
  const colorConfig = CLASS_COLORS[colorKey] || CLASS_COLORS.indigo;
  const IconComponent = Icons[iconName] || Icons.BookOpen;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (wasDragging.current) {
          wasDragging.current = false;
          return;
        }
        navigate(`/student/class/${cls.id}`);
      }}
      className="bg-white border rounded-xl p-6 hover:shadow-md transition-shadow h-full cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`${colorConfig.bg} p-3 rounded-lg ${colorConfig.text}`}>
          <IconComponent className="w-6 h-6" />
        </div>
        <Icons.ChevronRight className="w-5 h-5 text-gray-400" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{cls.name}</h3>
      <p className="text-sm text-gray-500 italic">{t('dashboard.enrolled')}</p>
    </div>
  );
}

export default function StudentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [userSettings, setUserSettings] = useState({});
  const [classOrder, setClassOrder] = useState([]);
  const [pendingClasses, setPendingClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!user) return;

    // Listen to user document for settings and order
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserSettings(data.classSettings || {});
        setClassOrder(data.classOrder || []);
      }
    });

    // Classes where student is enrolled
    const q1 = query(collection(db, 'classes'), where('studentUids', 'array-contains', user.uid));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      const loadedClasses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(loadedClasses);
      setLoading(false);

      // Automatic redirection if in exactly one class
      if (loadedClasses.length === 1 && !classOrder.length) {
        navigate(`/student/class/${loadedClasses[0].id}`, { replace: true });
      }
    });

    // Classes where student is pending
    const q2 = query(collection(db, 'classes'));
    const unsub2 = onSnapshot(q2, (snapshot) => {
      const pending = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(cls => cls.pendingStudents?.some(s => s.uid === user.uid));
      setPendingClasses(pending);
    });

    return () => {
      unsubUser();
      unsub1();
      unsub2();
    };
  }, [user, navigate, classOrder.length]);

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const code = joinCode.replace(/\s+/g, '');
    if (!code) return;

    setJoinLoading(true);
    setJoinError(false);
    try {
      const q = query(collection(db, 'classes'), where('joinCode', '==', code), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setJoinError(true);
      } else {
        navigate(`/join/${snap.docs[0].id}`);
      }
    } catch (err) {
      console.error('Join by code error:', err);
      setJoinError(true);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortedClasses.findIndex((cls) => cls.id === active.id);
      const newIndex = sortedClasses.findIndex((cls) => cls.id === over.id);

      const newSortedClasses = arrayMove(sortedClasses, oldIndex, newIndex);
      const newOrder = newSortedClasses.map(c => c.id);

      setClassOrder(newOrder);
      await updateDoc(doc(db, 'users', user.uid), {
        classOrder: newOrder
      });
    }
  };

  const sortedClasses = [...classes].sort((a, b) => {
    const indexA = classOrder.indexOf(a.id);
    const indexB = classOrder.indexOf(b.id);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icons.Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.student_title')}</h1>
          <p className="text-gray-500">{t('dashboard.view_classes')}</p>
        </div>
        <form onSubmit={handleJoinByCode} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength="7"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value); setJoinError(false); }}
              placeholder={t('dashboard.enter_code')}
              className="w-44 px-4 py-2 border rounded-lg font-mono tracking-widest text-center outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={joinLoading || !joinCode.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:bg-gray-300"
            >
              {joinLoading ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.LogIn className="w-4 h-4" />}
              {t('dashboard.join_submit')}
            </button>
          </div>
          {joinError && (
            <p className="text-xs text-red-600 font-medium">{t('dashboard.invalid_code')}</p>
          )}
        </form>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Icons.GraduationCap className="w-5 h-5 text-indigo-600" />
          {t('dashboard.my_classes')}
        </h2>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedClasses.map(c => c.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedClasses.map((cls) => (
                <SortableClassCard
                  key={cls.id}
                  cls={cls}
                  userSettings={userSettings}
                  t={t}
                />
              ))}
              {classes.length === 0 && pendingClasses.length === 0 && (
                <div className="col-span-full py-12 text-center bg-gray-50 border-2 border-dashed rounded-xl">
                  <p className="text-gray-500">{t('dashboard.no_classes_student')}</p>
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      {pendingClasses.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icons.Clock className="w-5 h-5 text-orange-500" />
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
