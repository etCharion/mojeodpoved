import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const Login = () => {
  const { user, userData, loginWithGoogle } = useAuth();

  if (user && userData) {
    return <Navigate to={userData.role === 'teacher' ? '/teacher' : '/student'} />;
  }

  return (
    <div className="min-height-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to PeerGrade
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Use your Google account to get started
          </p>
        </div>
        <div>
          <button
            onClick={loginWithGoogle}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
