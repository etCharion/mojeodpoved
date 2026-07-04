import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, ArrowLeft, Save, GripVertical } from 'lucide-react';
import Breadcrumbs from '../../components/Breadcrumbs';
import { RichTextInput } from '../../components/RichTextEditor';
import { useTranslation } from 'react-i18next';
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

function SortableOption({ id, value, optIdx, onUpdate, onRemove }) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-center group/opt">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-indigo-400 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <input
        type="text"
        required
        placeholder={t('assignment.option_placeholder', { count: optIdx + 1 })}
        value={value}
        onChange={(e) => onUpdate(e.target.value)}
        className="flex-1 px-3 py-1 text-sm border rounded bg-white outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-300 hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition-opacity"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function SortableRubricItem({ item, onRemove, onUpdate, onUpdateOption, onAddOption, onRemoveOption, onReorderOptions }) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = item.options.findIndex((opt) => opt.id === active.id);
      const newIndex = item.options.findIndex((opt) => opt.id === over.id);
      onReorderOptions(item.id, oldIndex, newIndex);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 border rounded-lg relative group bg-gray-50 ${isDragging ? 'shadow-lg border-indigo-300 ring-2 ring-indigo-100' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 text-gray-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase bg-white px-2 py-0.5 rounded border">
              {item.type}
            </span>
            <input
              type="text"
              required
              placeholder={t('assignment.question_placeholder')}
              value={item.question}
              onChange={(e) => onUpdate(item.id, 'question', e.target.value)}
              className="flex-1 bg-transparent font-medium outline-none border-b border-dashed focus:border-indigo-500"
            />
          </div>

          {item.type === 'choice' && (
            <div className="pl-6 space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={item.options.map(opt => opt.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {item.options.map((opt, optIdx) => (
                    <SortableOption
                      key={opt.id}
                      id={opt.id}
                      value={opt.value}
                      optIdx={optIdx}
                      onUpdate={(val) => onUpdateOption(item.id, opt.id, val)}
                      onRemove={() => onRemoveOption(item.id, opt.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <button
                type="button"
                onClick={() => onAddOption(item.id)}
                className="text-xs text-indigo-600 font-medium hover:underline"
              >
                {t('assignment.add_option')}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-gray-400 hover:text-red-500 shrink-0"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default function AssignmentBuilder() {
  const { t } = useTranslation();
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  const copyFrom = searchParams.get('copyFrom');
  const navigate = useNavigate();

  const [loading, setLoading] = useState((assignmentId || copyFrom) ? true : false);
  const [mode, setMode] = useState('peer');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mandatoryFeedback, setMandatoryFeedback] = useState(true);
  const [minCharCount, setMinCharCount] = useState(50);
  const [reviewsPerSubmission, setReviewsPerSubmission] = useState(3);
  const [reviewStartThreshold, setReviewStartThreshold] = useState(5);
  const [expectedSubmissions, setExpectedSubmissions] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [timerStart, setTimerStart] = useState('typing');
  const [isVisible, setIsVisible] = useState(true);
  const [allowSubmissions, setAllowSubmissions] = useState(true);
  const [allowReviews, setAllowReviews] = useState(true);
  const [rubric, setRubric] = useState([
    { id: '1', type: 'stars', question: 'Overall Quality' }
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const idToFetch = assignmentId || copyFrom;
    if (idToFetch) {
      const fetchAssignment = async () => {
        const docRef = doc(db, 'assignments', idToFetch);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setMode(data.mode === 'teacher' ? 'teacher' : 'peer');
          setTitle(data.title);
          setDescription(data.description);
          setMandatoryFeedback(data.mandatory_feedback);
          setMinCharCount(data.min_char_count);
          setReviewsPerSubmission(data.reviews_per_submission);
          setReviewStartThreshold(data.review_start_threshold);
          setExpectedSubmissions(data.expected_submissions || '');
          setTimeLimit(data.timeLimit || '');
          setTimerStart(data.timerStart === 'open' ? 'open' : 'typing');
          setIsVisible(data.isVisible ?? true);
          setAllowSubmissions(data.allowSubmissions ?? true);
          setAllowReviews(data.allowReviews ?? true);

          // If copying, regenerate IDs for rubric items to ensure they are unique
          const newRubric = (data.rubric || []).map(item => {
            const newItemId = copyFrom ? `copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : item.id;
            return {
              ...item,
              id: newItemId,
              options: (item.options || []).map((opt, idx) => {
                if (typeof opt === 'string') {
                  return { id: `legacy-${idx}-${Date.now()}`, value: opt };
                }
                return copyFrom ? { ...opt, id: `opt-copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` } : opt;
              })
            };
          });
          setRubric(newRubric);
        }
        setLoading(false);
      };
      fetchAssignment();
    }
  }, [assignmentId, copyFrom]);

  const addRubricItem = (type) => {
    const newItem = {
      id: Date.now().toString(),
      type,
      question: '',
      options: type === 'choice' ? [
        { id: Date.now().toString() + '-0', value: '' },
        { id: Date.now().toString() + '-1', value: '' }
      ] : []
    };
    setRubric([...rubric, newItem]);
  };

  const updateRubricItem = (id, field, value) => {
    setRubric(rubric.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const updateOption = (itemId, optId, value) => {
    setRubric(rubric.map(item => {
      if (item.id === itemId) {
        const newOpts = item.options.map(opt =>
          opt.id === optId ? { ...opt, value } : opt
        );
        return { ...item, options: newOpts };
      }
      return item;
    }));
  };

  const addOption = (itemId) => {
    setRubric(rubric.map(item =>
      item.id === itemId ? { ...item, options: [...item.options, { id: Date.now().toString(), value: '' }] } : item
    ));
  };

  const removeOption = (itemId, optId) => {
    setRubric(rubric.map(item => {
      if (item.id === itemId) {
        return { ...item, options: item.options.filter(opt => opt.id !== optId) };
      }
      return item;
    }));
  };

  const handleReorderOptions = (itemId, oldIndex, newIndex) => {
    setRubric(rubric.map(item => {
      if (item.id === itemId) {
        return { ...item, options: arrayMove(item.options, oldIndex, newIndex) };
      }
      return item;
    }));
  };

  const removeRubricItem = (id) => {
    setRubric(rubric.filter(item => item.id !== id));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setRubric((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation for rich text
    const plainDescription = description.replace(/<[^>]*>/g, '').trim();
    if (!plainDescription) {
      alert(t('assignment.error_saving')); // Or a more specific message if available
      return;
    }

    const data = {
      mode,
      title,
      description,
      mandatory_feedback: mandatoryFeedback,
      min_char_count: parseInt(minCharCount),
      reviews_per_submission: parseInt(reviewsPerSubmission),
      review_start_threshold: parseInt(reviewStartThreshold),
      expected_submissions: expectedSubmissions ? parseInt(expectedSubmissions) : null,
      timeLimit: timeLimit ? parseInt(timeLimit) : null,
      timerStart,
      isVisible,
      allowSubmissions,
      allowReviews,
      rubric,
      status: 'open',
      updatedAt: serverTimestamp()
    };

    try {
      if (assignmentId) {
        await updateDoc(doc(db, 'assignments', assignmentId), data);
      } else {
        if (!classId) throw new Error("Class ID is missing");
        data.classId = classId;
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'assignments'), data);
      }
      navigate(-1);
    } catch (err) {
      console.error(err);
      alert(t('assignment.error_saving'));
    }
  };

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">{assignmentId ? t('assignment.edit_assignment') : t('class.new_assignment')}</h1>
          <Breadcrumbs />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Submission Mode */}
        <section className="bg-white p-6 rounded-xl border space-y-4">
          <h2 className="text-xl font-semibold mb-4">{t('assignment.submission_mode')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode('peer')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${mode === 'peer' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
            >
              <h3 className="font-bold text-gray-900">{t('assignment.mode_peer')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('assignment.mode_peer_desc')}</p>
            </button>
            <button
              type="button"
              onClick={() => setMode('teacher')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${mode === 'teacher' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
            >
              <h3 className="font-bold text-gray-900">{t('assignment.mode_teacher')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('assignment.mode_teacher_desc')}</p>
            </button>
          </div>
          {mode === 'teacher' && (
            <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              {t('assignment.teacher_texts_desc')}
            </p>
          )}
        </section>

        {/* Basic Info */}
        <section className="bg-white p-6 rounded-xl border space-y-4">
          <h2 className="text-xl font-semibold mb-4">{t('assignment.basic_info')}</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.title_label')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t('assignment.title_label')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.instructions')}</label>
            <RichTextInput
              content={description}
              onChange={setDescription}
              placeholder={t('assignment.what_to_do')}
              editorClassName="min-h-[200px] p-4"
            />
          </div>
          {mode === 'peer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.time_limit')}</label>
              <input
                type="number"
                min="1"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. 45"
              />
              <p className="text-xs text-gray-500 mt-1">{t('assignment.time_limit_desc')}</p>

              {timeLimit && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('assignment.timer_start_label')}</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['typing', 'open'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setTimerStart(option)}
                        className={`text-left p-3 rounded-lg border-2 transition-all ${timerStart === option ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
                      >
                        <span className="font-medium text-sm text-gray-900">{t(`assignment.timer_start_${option}`)}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{t(`assignment.timer_start_${option}_desc`)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Control Toggles */}
        <section className="bg-white p-6 rounded-xl border space-y-6">
          <h2 className="text-xl font-semibold mb-4">{t('common.status')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-sm">{t('assignment.visibility')}</h3>
                <p className="text-xs text-gray-500">{t('assignment.visibility_desc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {mode === 'peer' && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h3 className="font-medium text-sm">{t('assignment.allow_submissions')}</h3>
                  <p className="text-xs text-gray-500">{t('assignment.allow_submissions_desc')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowSubmissions}
                    onChange={(e) => setAllowSubmissions(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-sm">{t('assignment.allow_reviews')}</h3>
                <p className="text-xs text-gray-500">{t('assignment.allow_reviews_desc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowReviews}
                  onChange={(e) => setAllowReviews(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Peer Review Settings */}
        <section className="bg-white p-6 rounded-xl border space-y-6">
          <h2 className="text-xl font-semibold mb-4">{t('assignment.peer_review_config')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.reviews_per_student')}</label>
              <input
                type="number"
                min="1"
                value={reviewsPerSubmission}
                onChange={(e) => setReviewsPerSubmission(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {mode === 'peer' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.min_submissions')}</label>
                  <input
                    type="number"
                    min="1"
                    value={reviewStartThreshold}
                    onChange={(e) => setReviewStartThreshold(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.expected_count')}</label>
                  <input
                    type="number"
                    min="0"
                    value={expectedSubmissions}
                    onChange={(e) => setExpectedSubmissions(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Auto"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('assignment.expected_count_desc')}</p>
                </div>
              </>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{t('assignment.mandatory_feedback')}</h3>
                <p className="text-sm text-gray-500">{t('assignment.require_comments')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mandatoryFeedback}
                  onChange={(e) => setMandatoryFeedback(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {mandatoryFeedback && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignment.min_char_count')}</label>
                <input
                  type="number"
                  min="0"
                  value={minCharCount}
                  onChange={(e) => setMinCharCount(e.target.value)}
                  className="w-32 px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </section>

        {/* Rubric Builder */}
        <section className="bg-white p-6 rounded-xl border space-y-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">{t('assignment.grading_rubric')}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addRubricItem('stars')}
                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium"
              >
                {t('assignment.add_stars')}
              </button>
              <button
                type="button"
                onClick={() => addRubricItem('choice')}
                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium"
              >
                {t('assignment.add_choice')}
              </button>
              <button
                type="button"
                onClick={() => addRubricItem('passfail')}
                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium"
              >
                {t('assignment.add_passfail')}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={rubric.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {rubric.map((item) => (
                  <SortableRubricItem
                    key={item.id}
                    item={item}
                    onRemove={removeRubricItem}
                    onUpdate={updateRubricItem}
                    onUpdateOption={updateOption}
                    onAddOption={addOption}
                    onRemoveOption={removeOption}
                    onReorderOptions={handleReorderOptions}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {rubric.length === 0 && (
              <p className="text-center py-8 text-gray-400 italic">{t('assignment.add_criterion')}</p>
            )}
          </div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-center z-10 shadow-lg">
          <div className="max-w-4xl w-full flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md"
            >
              <Save className="w-5 h-5" />
              {t('assignment.save_assignment')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
