import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, BookOpen, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Navbar = () => {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('cs') ? 'en' : 'cs';
    i18n.changeLanguage(nextLang);
  };

  const currentFlag = i18n.language.startsWith('cs') ? '🇨🇿' : '🇺🇸';

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-indigo-600">
          <BookOpen className="w-6 h-6" />
          <span>{t('navbar.title')}</span>
        </Link>

        <div className="flex items-center gap-6">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors text-lg"
            title={i18n.language.startsWith('cs') ? 'Switch to English' : 'Přepnout do češtiny'}
          >
            <span>{currentFlag}</span>
          </button>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="w-4 h-4" />
            <span>{userData?.displayName} ({userData?.role === 'teacher' ? t('common.roles.teacher') : t('common.roles.student')})</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
