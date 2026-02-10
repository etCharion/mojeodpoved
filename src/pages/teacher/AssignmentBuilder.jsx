import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react';

export default function AssignmentBuilder() {
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(assignmentId ? true : false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mandatoryFeedback, setMandatoryFeedback] = useState(true);
  const [minCharCount, setMinCharCount] = useState(50);
  const [reviewsPerSubmission, setReviewsPerSubmission] = useState(3);
  const [reviewStartThreshold, setReviewStartThreshold] = useState(5);
  const [rubric, setRubric] = useState([
    { id: '1', type: 'stars', question: 'Overall Quality' }
  ]);

  useEffect(() => {
    if (assignmentId) {
      const fetchAssignment = async () => {
        const docRef = doc(db, 'assignments', assignmentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTitle(data.title);
          setDescription(data.description);
          setMandatoryFeedback(data.mandatory_feedback);
          setMinCharCount(data.min_char_count);
          setReviewsPerSubmission(data.reviews_per_submission);
          setReviewStartThreshold(data.review_start_threshold);
          setRubric(data.rubric || []);
        }
        setLoading(false);
      };
      fetchAssignment();
    }
  }, [assignmentId]);

  const addRubricItem = (type) => {
    const newItem = {
      id: Date.now().toString(),
      type,
      question: '',
      options: type === 'choice' ? ['', ''] : []
    };
    setRubric([...rubric, newItem]);
  };

  const updateRubricItem = (id, field, value) => {
    setRubric(rubric.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const updateOption = (itemId, optIdx, value) => {
    setRubric(rubric.map(item => {
      if (item.id === itemId) {
        const newOpts = [...item.options];
        newOpts[optIdx] = value;
        return { ...item, options: newOpts };
      }
      return item;
    }));
  };

  const addOption = (itemId) => {
    setRubric(rubric.map(item =>
      item.id === itemId ? { ...item, options: [...item.options, ''] } : item
    ));
  };

  const removeRubricItem = (id) => {
    setRubric(rubric.filter(item => item.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      title,
      description,
      mandatory_feedback: mandatoryFeedback,
      min_char_count: parseInt(minCharCount),
      reviews_per_submission: parseInt(reviewsPerSubmission),
      review_start_threshold: parseInt(reviewStartThreshold),
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
      alert('Error saving assignment');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-3xl font-bold">{assignmentId ? 'Edit Assignment' : 'New Assignment'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <section className="bg-white p-6 rounded-xl border space-y-4">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Assignment title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 h-32"
              placeholder="What should students do?"
            />
          </div>
        </section>

        {/* Peer Review Settings */}
        <section className="bg-white p-6 rounded-xl border space-y-6">
          <h2 className="text-xl font-semibold mb-4">Peer Review Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reviews per Student (N)</label>
              <input
                type="number"
                min="1"
                value={reviewsPerSubmission}
                onChange={(e) => setReviewsPerSubmission(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Submissions to Start (M)</label>
              <input
                type="number"
                min="1"
                value={reviewStartThreshold}
                onChange={(e) => setReviewStartThreshold(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Mandatory Feedback</h3>
                <p className="text-sm text-gray-500">Require students to write comments</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Character Count</label>
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
            <h2 className="text-xl font-semibold">Grading Rubric</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addRubricItem('stars')}
                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium"
              >
                + Stars Rating
              </button>
              <button
                type="button"
                onClick={() => addRubricItem('choice')}
                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium"
              >
                + Multiple Choice
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {rubric.map((item, idx) => (
              <div key={item.id} className="p-4 border rounded-lg relative group bg-gray-50">
                <button
                  type="button"
                  onClick={() => removeRubricItem(item.id)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase bg-white px-2 py-0.5 rounded border">
                      {item.type}
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Enter the question or criterion..."
                      value={item.question}
                      onChange={(e) => updateRubricItem(item.id, 'question', e.target.value)}
                      className="flex-1 bg-transparent font-medium outline-none border-b border-dashed focus:border-indigo-500"
                    />
                  </div>

                  {item.type === 'choice' && (
                    <div className="pl-6 space-y-2">
                      {item.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex gap-2">
                          <input
                            type="text"
                            required
                            placeholder={`Option ${optIdx + 1}`}
                            value={opt}
                            onChange={(e) => updateOption(item.id, optIdx, e.target.value)}
                            className="flex-1 px-3 py-1 text-sm border rounded bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(item.id)}
                        className="text-xs text-indigo-600 font-medium hover:underline"
                      >
                        + Add Option
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {rubric.length === 0 && (
              <p className="text-center py-8 text-gray-400 italic">Add at least one criterion to the rubric.</p>
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
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md"
            >
              <Save className="w-5 h-5" />
              Save Assignment
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
