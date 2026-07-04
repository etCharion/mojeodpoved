import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove, getDocs, getDoc } from 'firebase/firestore';
import { commitBatched } from '../../lib/batch';
import { Users, BookOpen, Plus, Check, X, Clipboard, ExternalLink, Trash2, QrCode, Settings, Copy, ChevronRight, ArrowLeft, GripVertical } from 'lucide-react';
import * as AllIcons from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Breadcrumbs from '../../components/Breadcrumbs';
import { useTranslation } from 'react-i18next';
import { CLASS_COLORS, CLASS_ICONS } from '../../lib/constants';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableAssignmentItem({ assignment, isTeacher, t, setCopyModal, handleDeleteAssignment }) {
  const navigate = useNavigate();
  const wasDragging = React.useRef(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: assignment.id, disabled: !isTeacher });

  useEffect(() => {
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

  const handleNavigate = () => {
    navigate(isTeacher ? `/teacher/assignment/${assignment.id}` : `/student/assignment/${assignment.id}`);
  };

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
        handleNavigate();
      }}
      className={`p-4 bg-white border rounded-xl hover:shadow-sm transition-shadow flex justify-between items-center cursor-pointer ${isDragging ? 'shadow-lg border-indigo-200' : ''}`}
    >
      <div className="flex items-center gap-3">
        {isTeacher && (
          <GripVertical className="w-5 h-5 text-gray-400 cursor-grab active:cursor-grabbing" />
        )}
        <div>
          <h3 className="font-medium text-gray-900">{assignment.title}</h3>
          <p className="text-sm text-gray-500">
            {assignment.reviews_per_submission} {t('assignment.reviews_per_student').toLowerCase()} • {t('assignment.min_submissions').replace('Min Submissions to Start (M)', 'Start at')} {assignment.review_start_threshold} {t('assignment.submissions').toLowerCase()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {(() => {
          let label = t('common.open');
          let color = 'bg-green-100 text-green-700';

          if (assignment.isVisible === false) {
            label = t('common.hidden');
            color = 'bg-gray-100 text-gray-700';
          } else if (assignment.allowSubmissions === false) {
            if (assignment.allowReviews !== false) {
              label = t('common.open');
              color = 'bg-yellow-100 text-yellow-700';
            } else {
              label = t('common.closed');
              color = 'bg-red-100 text-red-700';
            }
          }

          return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${color}`}>
              {label}
            </span>
          );
        })()}
        {isTeacher && (
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCopyModal({ isOpen: true, mode: 'select_target', sourceAssignment: assignment });
              }}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              title={t('assignment.copy_assignment')}
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteAssignment(e, assignment.id);
              }}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title={t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
        <ExternalLink className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

function CopyAssignmentModal({ isOpen, onClose, currentClassId, sourceAssignment, mode, t, user }) {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      const fetchClasses = async () => {
        const q = query(collection(db, 'classes'), where('teacherId', '==', user.uid));
        const snap = await getDocs(q);
        setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => mode === 'select_source' ? c.id !== currentClassId : c.id !== sourceAssignment?.classId));
      };
      fetchClasses();
    }
  }, [isOpen, user.uid, currentClassId, mode, sourceAssignment]);

  const handleClassSelect = async (classId) => {
    if (mode === 'select_source') {
      setSelectedClassId(classId);
      setLoading(true);
      const q = query(collection(db, 'assignments'), where('classId', '==', classId));
      const snap = await getDocs(q);
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    } else {
      navigate(`/teacher/assignment/new?classId=${classId}&copyFrom=${sourceAssignment.id}`);
    }
  };

  const handleAssignmentSelect = (assignmentId) => {
    navigate(`/teacher/assignment/new?classId=${currentClassId}&copyFrom=${assignmentId}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'select_source' ? t('assignment.select_source_assignment') : t('assignment.select_target_class')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {!selectedClassId ? (
             <div className="grid gap-2">
               {classes.map(c => (
                 <button
                   key={c.id}
                   onClick={() => handleClassSelect(c.id)}
                   className="flex items-center justify-between p-4 border rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left"
                 >
                   <span className="font-medium">{c.name}</span>
                   <ChevronRight className="w-5 h-5 text-gray-400" />
                 </button>
               ))}
               {classes.length === 0 && <p className="text-center py-4 text-gray-500">{t('dashboard.no_classes_teacher')}</p>}
             </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedClassId('')}
                className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-1 mb-2"
              >
                <ArrowLeft className="w-4 h-4" /> {t('common.back')}
              </button>
              <div className="grid gap-2">
                {assignments.map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleAssignmentSelect(a.id)}
                    className="flex items-center justify-between p-4 border rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left"
                  >
                    <span className="font-medium">{a.title}</span>
                    <Plus className="w-5 h-5 text-indigo-500" />
                  </button>
                ))}
                {loading && <p className="text-center py-4">{t('common.loading')}</p>}
                {!loading && assignments.length === 0 && <p className="text-center py-4 text-gray-500">{t('class.no_assignments')}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassSettingsModal({ classInfo, onClose, isTeacher, user, t }) {
  const [name, setName] = useState(classInfo.name);
  const [selectedColor, setSelectedColor] = useState(classInfo.color || 'indigo');
  const [selectedIcon, setSelectedIcon] = useState(classInfo.icon || 'BookOpen');

  useEffect(() => {
    const fetchPersonal = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const settings = userDoc.data().classSettings?.[classInfo.id] || {};
        if (settings.color) setSelectedColor(settings.color);
        if (settings.icon) setSelectedIcon(settings.icon);
      }
    };
    fetchPersonal();
  }, [user.uid, classInfo.id]);

  const handleSave = async () => {
    try {
      // Save personal settings
      const userRef = doc(db, 'users', user.uid);

      await updateDoc(userRef, {
        [`classSettings.${classInfo.id}`]: {
          color: selectedColor,
          icon: selectedIcon
        }
      });

      // If teacher, also update class defaults
      if (isTeacher) {
        await updateDoc(doc(db, 'classes', classInfo.id), {
          name,
          color: selectedColor,
          icon: selectedIcon
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert(t('assignment.error_saving'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('common.settings')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="space-y-6">
          {isTeacher && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t('assignment.title_label')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              {t('class.icon')}
            </label>
            <div className="grid grid-cols-7 gap-2">
              {CLASS_ICONS.map((iconName) => {
                const IconComp = AllIcons[iconName] || BookOpen;
                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-2 rounded-lg border transition-all ${
                      selectedIcon === iconName
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-110'
                        : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <IconComp className="w-5 h-5 mx-auto" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              {t('class.color')}
            </label>
            <div className="grid grid-cols-7 gap-2">
              {Object.entries(CLASS_COLORS).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setSelectedColor(key)}
                  className={`w-10 h-10 rounded-full border-4 transition-all flex items-center justify-center ${
                    selectedColor === key
                      ? 'border-gray-900 scale-110 shadow-sm'
                      : 'border-transparent hover:scale-105'
                  } ${config.bg}`}
                >
                  {selectedColor === key && <Check className={`w-5 h-5 ${config.text}`} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-8 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md font-bold"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClassDetails() {
  const { t } = useTranslation();
  const { classId } = useParams();
  const { user, userData } = useAuth();
  const [classInfo, setClassInfo] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [copyModal, setCopyModal] = useState({ isOpen: false, mode: 'select_source', sourceAssignment: null });

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
    if (!classId) return;

    const unsubClass = onSnapshot(doc(db, 'classes', classId), async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setClassInfo({ id: docSnapshot.id, ...data });

        // Generate joinCode if missing — only the class teacher may write it
        if (!data.joinCode && data.teacherId === user?.uid) {
          const newCode = Math.floor(100000 + Math.random() * 900000).toString();
          await updateDoc(doc(db, 'classes', classId), {
            joinCode: newCode
          });
        }
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
  }, [classId, user?.uid]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentEmail.trim()) return;

    const emails = newStudentEmail
      .split(/[,\s\n\t;]+/)
      .map(email => email.trim().toLowerCase())
      .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

    if (emails.length === 0) return;

    await updateDoc(doc(db, 'classes', classId), {
      studentEmails: arrayUnion(...emails)
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

  const handleRemoveStudent = async (email) => {
    if (!window.confirm(t('class.remove_confirm', { email }))) return;

    try {
      // 1. Remove from studentEmails
      await updateDoc(doc(db, 'classes', classId), {
        studentEmails: arrayRemove(email)
      });

      // 2. Try to find the UID to remove from studentUids
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const studentUid = querySnapshot.docs[0].id;
        await updateDoc(doc(db, 'classes', classId), {
          studentUids: arrayRemove(studentUid)
        });
      }
    } catch (err) {
      console.error("Error removing student:", err);
    }
  };

  const getJoinLink = () => {
    const baseUrl = import.meta.env.BASE_URL;
    return `${window.location.origin}${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}join/${classId}`;
  };

  const copyJoinLink = () => {
    navigator.clipboard.writeText(getJoinLink());
    alert(t('class.link_copied'));
  };

  if (loading) return <div>{t('common.loading')}</div>;
  if (!classInfo) return <div>{t('common.unknown').replace('Unknown', 'Class not found')}</div>;

  const isTeacher = userData?.role === 'teacher';

  const handleAssignmentDragEnd = async (event) => {
    if (!isTeacher) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortedAssignments.findIndex((a) => a.id === active.id);
      const newIndex = sortedAssignments.findIndex((a) => a.id === over.id);

      const newSortedAssignments = arrayMove(sortedAssignments, oldIndex, newIndex);
      const newOrder = newSortedAssignments.map(a => a.id);

      await updateDoc(doc(db, 'classes', classId), {
        assignmentOrder: newOrder
      });
    }
  };

  const sortedAssignments = [...assignments].sort((a, b) => {
    const order = classInfo?.assignmentOrder || [];
    const indexA = order.indexOf(a.id);
    const indexB = order.indexOf(b.id);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    // Fallback to createdAt
    const dateA = a.createdAt?.seconds || 0;
    const dateB = b.createdAt?.seconds || 0;
    return dateA - dateB;
  });

  const handleDeleteAssignment = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('assignment.delete_confirm'))) return;

    try {
      const qReviews = query(collection(db, 'reviews'), where('assignmentId', '==', id));
      const snapReviews = await getDocs(qReviews);

      const qSubmissions = query(collection(db, 'submissions'), where('assignmentId', '==', id));
      const snapSubmissions = await getDocs(qSubmissions);

      await commitBatched([
        ...snapReviews.docs.map(d => ({ type: 'delete', ref: d.ref })),
        ...snapSubmissions.docs.map(d => ({ type: 'delete', ref: d.ref })),
        { type: 'delete', ref: doc(db, 'assignments', id) }
      ]);
    } catch (err) {
      console.error(err);
      alert("Error deleting assignment");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{classInfo.name}</h1>
          <p className="text-gray-500 mb-1">{t('class.management')}</p>
          <Breadcrumbs />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            title={t('common.settings')}
          >
            <Settings className="w-6 h-6" />
          </button>
          {isTeacher && (
            <div className="flex gap-2">
              <button
                onClick={() => setCopyModal({ isOpen: true, mode: 'select_source', sourceAssignment: null })}
                className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-5 h-5" />
                <span>{t('assignment.copy_assignment')}</span>
              </button>
              <Link
                to={`/teacher/assignment/new?classId=${classId}`}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>{t('class.new_assignment')}</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assignments List */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            {t('class.assignments')}
          </h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleAssignmentDragEnd}
          >
            <SortableContext
              items={sortedAssignments.map(a => a.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid gap-4">
                {sortedAssignments
                  .filter(a => isTeacher || a.isVisible !== false)
                  .map((assignment) => (
                    <SortableAssignmentItem
                      key={assignment.id}
                      assignment={assignment}
                      isTeacher={isTeacher}
                      t={t}
                      setCopyModal={setCopyModal}
                      handleDeleteAssignment={handleDeleteAssignment}
                    />
                ))}
                {assignments.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 border-2 border-dashed rounded-xl text-gray-500">
                    {t('class.no_assignments')}
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Student Management (Teacher Only) */}
        {isTeacher && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('class.students')}
            </h2>

            <div className="bg-white border rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={copyJoinLink}
                  className="flex items-center justify-center gap-2 px-3 py-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-xs font-medium"
                  title={t('class.copy_link')}
                >
                  <Clipboard className="w-4 h-4" />
                  <span>{t('class.copy_link')}</span>
                </button>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-xs font-medium"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{t('class.qr_code')}</span>
                </button>
              </div>

              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <div className="text-center mb-2">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('class.join_code')}</p>
                  <p className="text-2xl font-mono font-bold text-indigo-600 tracking-widest">
                    {classInfo.joinCode?.replace(/(\d{3})(\d{3})/, '$1 $2') || '------'}
                  </p>
                </div>
                <div
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setShowQRModal(true)}
                >
                  <QRCodeSVG value={getJoinLink()} size={80} />
                </div>
              </div>

              <form onSubmit={handleAddStudent} className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('class.add_batch')}</label>
                <div className="flex flex-col gap-2">
                  <textarea
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    placeholder={t('class.batch_placeholder')}
                    rows="3"
                    className="w-full px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button type="submit" className="w-full bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
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
                    <div key={idx} className="flex items-center justify-between py-1 border-b last:border-0 group">
                      <span className="text-sm text-gray-600 truncate">{email}</span>
                      <button
                        onClick={() => handleRemoveStudent(email)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

      {/* Copy Modal */}
      {copyModal.isOpen && (
        <CopyAssignmentModal
          isOpen={copyModal.isOpen}
          onClose={() => setCopyModal({ ...copyModal, isOpen: false })}
          currentClassId={classId}
          sourceAssignment={copyModal.sourceAssignment}
          mode={copyModal.mode}
          t={t}
          user={user}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <ClassSettingsModal
          classInfo={classInfo}
          onClose={() => setShowSettingsModal(false)}
          isTeacher={isTeacher}
          user={user}
          t={t}
        />
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-8" onClick={() => setShowQRModal(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full flex flex-col items-center gap-8 relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-8 h-8" />
            </button>

            <h2 className="text-3xl font-bold text-gray-900">{classInfo.name}</h2>

            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <QRCodeSVG value={getJoinLink()} size={400} level="H" />
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500 uppercase font-bold tracking-[0.2em] mb-2">{t('class.join_code')}</p>
              <p className="text-7xl font-mono font-bold text-indigo-600 tracking-widest">
                {classInfo.joinCode?.replace(/(\d{3})(\d{3})/, '$1 $2')}
              </p>
            </div>

            <div className="text-center mt-4">
              <p className="text-xl text-gray-600 font-medium">{getJoinLink()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
