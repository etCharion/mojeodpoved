import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
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
        navigate(`/teacher/class/${cls.id}`);
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
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-1">
          <Icons.Users className="w-4 h-4" />
          <span>{(cls.studentEmails?.length || 0) + (cls.studentUids?.length || 0)} {t('dashboard.students_count')}</span>
        </div>
      </div>
    </div>
  );
}

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [userSettings, setUserSettings] = useState({});
  const [classOrder, setClassOrder] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

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

    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserSettings(data.classSettings || {});
        setClassOrder(data.classOrder || []);
      }
    });

    const q = query(collection(db, 'classes'), where('teacherId', '==', user.uid));
    const unsubClasses = onSnapshot(q, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUser();
      unsubClasses();
    };
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
      createdAt: serverTimestamp(),
      color: 'indigo',
      icon: 'BookOpen'
    });

    setNewClassName('');
    setShowCreateModal(false);
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
          <Icons.Plus className="w-5 h-5" />
          <span>{t('dashboard.create_class')}</span>
        </button>
      </div>

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
            {classes.length === 0 && (
              <div className="col-span-full py-12 text-center bg-gray-50 border-2 border-dashed rounded-xl">
                <p className="text-gray-500">{t('dashboard.no_classes_teacher')}</p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

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
