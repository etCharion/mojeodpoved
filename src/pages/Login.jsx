import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Login = () => {
  const { user, userData, loginWithGoogle } = useAuth();
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('cs') ? 'en' : 'cs';
    i18n.changeLanguage(nextLang);
  };

  const currentFlag = i18n.language.startsWith('cs') ? '🇨🇿' : '🇺🇸';

  if (user && userData) {
    return <Navigate to={userData.role === 'teacher' ? '/teacher' : '/student'} />;
  }

  return (
    <div className="min-height-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 transition-colors text-lg"
        >
          <span>{currentFlag}</span>
        </button>
      </div>

      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('login.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('login.subtitle')}
          </p>
        </div>
        <div>
          <button
            onClick={loginWithGoogle}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {t('login.button')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
