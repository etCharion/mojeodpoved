import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, BookOpen, Globe, Plus, Bell, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

const Navbar = () => {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [showJoinDropdown, setShowJoinDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [preApprovedClasses, setPreApprovedClasses] = useState([]);
  const [pendingClasses, setPendingClasses] = useState([]);

  const joinRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!user || userData?.role !== 'student') return;

    // Pre-approved classes (invited via email)
    const q1 = query(collection(db, 'classes'), where('studentEmails', 'array-contains', user.email.toLowerCase()));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      const classes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(cls => !cls.studentUids?.includes(user.uid));
      setPreApprovedClasses(classes);
    });

    // Pending approval classes (waiting for teacher)
    const q2 = query(collection(db, 'classes'));
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
  }, [user, userData]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (joinRef.current && !joinRef.current.contains(event.target)) {
        setShowJoinDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('cs') ? 'en' : 'cs';
    i18n.changeLanguage(nextLang);
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().replace(/\s/g, '');
    if (code.length !== 6) return;

    setIsJoining(true);
    try {
      const q = query(collection(db, 'classes'), where('joinCode', '==', code));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        alert(t('dashboard.invalid_code'));
      } else {
        const classId = snapshot.docs[0].id;
        setShowJoinDropdown(false);
        setJoinCode('');
        navigate(`/join/${classId}`);
      }
    } catch (err) {
      console.error("Error joining by code:", err);
      alert(t('join.error_desc'));
    } finally {
      setIsJoining(false);
    }
  };

  const currentFlag = i18n.language.startsWith('cs') ? '🇨🇿' : '🇺🇸';

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-indigo-600">
          <BookOpen className="w-6 h-6 flex-shrink-0" />
          <span className="hidden sm:inline">{t('navbar.title')}</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
          {userData?.role === 'student' && (
            <>
              {/* Join Class Icon */}
              <div className="relative" ref={joinRef}>
                <button
                  onClick={() => {
                    setShowJoinDropdown(!showJoinDropdown);
                    setShowNotifDropdown(false);
                  }}
                  className={`p-2 rounded-lg border transition-colors ${showJoinDropdown ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100'}`}
                  title={t('navbar.join_class')}
                >
                  <Plus className="w-5 h-5" />
                </button>

                {showJoinDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border rounded-xl shadow-xl p-4 z-50">
                    <form onSubmit={handleJoinByCode} className="space-y-4">
                      <label className="block text-sm font-medium text-gray-700">
                        {t('dashboard.join_class')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength="7"
                          value={joinCode}
                          autoFocus
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 6) {
                              setJoinCode(val.length > 3 ? `${val.slice(0, 3)} ${val.slice(3)}` : val);
                            }
                          }}
                          placeholder="123 456"
                          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-center tracking-widest"
                        />
                        <button
                          type="submit"
                          disabled={isJoining || joinCode.replace(/\s/g, '').length !== 6}
                          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                          {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    </form>

                    {preApprovedClasses.length > 0 && (
                      <div className="mt-6 pt-4 border-t">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          {t('dashboard.pending_approval')}
                        </p>
                        <div className="space-y-2">
                          {preApprovedClasses.map(cls => (
                            <Link
                              key={cls.id}
                              to={`/join/${cls.id}`}
                              onClick={() => setShowJoinDropdown(false)}
                              className="flex items-center justify-between p-2 rounded-lg border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                            >
                              <span className="text-sm font-medium text-gray-900 truncate pr-2">{cls.name}</span>
                              <span className="text-xs font-bold text-indigo-600 flex-shrink-0">{t('navbar.join_invite')}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notifications Icon */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setShowNotifDropdown(!showNotifDropdown);
                    setShowJoinDropdown(false);
                  }}
                  className={`p-2 rounded-lg border transition-colors relative ${showNotifDropdown ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'hover:bg-gray-50 text-gray-600'}`}
                  title={t('navbar.notifications')}
                >
                  <Bell className="w-5 h-5" />
                  {preApprovedClasses.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                      {preApprovedClasses.length}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border rounded-xl shadow-xl overflow-hidden z-50">
                    <div className="p-4 border-b bg-gray-50">
                      <h3 className="font-semibold text-gray-900">{t('navbar.notifications')}</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {preApprovedClasses.length === 0 && pendingClasses.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                          {t('navbar.no_notifications')}
                        </div>
                      ) : (
                        <div className="divide-y">
                          {preApprovedClasses.map(cls => (
                            <Link
                              key={cls.id}
                              to={`/join/${cls.id}`}
                              onClick={() => setShowNotifDropdown(false)}
                              className="block p-4 hover:bg-indigo-50 transition-colors"
                            >
                              <p className="text-sm font-medium text-gray-900">{cls.name}</p>
                              <p className="text-xs text-indigo-600 mt-1">{t('navbar.pre_approved_available')}</p>
                            </Link>
                          ))}
                          {pendingClasses.map(cls => (
                            <div key={cls.id} className="p-4 bg-gray-50/50">
                              <p className="text-sm font-medium text-gray-700">{cls.name}</p>
                              <p className="text-xs text-orange-600 mt-1">{t('navbar.pending_approval')}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            onClick={toggleLanguage}
            className="flex items-center justify-center w-10 h-10 rounded-lg border hover:bg-gray-50 transition-colors text-base"
            title={i18n.language.startsWith('cs') ? 'Switch to English' : 'Přepnout do češtiny'}
          >
            <span>{currentFlag}</span>
          </button>

          <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
            <User className="w-4 h-4" />
            <span>{userData?.displayName} ({userData?.role === 'teacher' ? t('common.roles.teacher') : t('common.roles.student')})</span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.logout')}</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
