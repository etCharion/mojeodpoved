import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import JoinClass from './pages/student/JoinClass';
import TeacherDashboard from './pages/teacher/Dashboard';
import StudentDashboard from './pages/student/Dashboard';
import ClassDetails from './pages/shared/ClassDetails';
import AssignmentDetails from './pages/shared/AssignmentDetails';
import AssignmentBuilder from './pages/teacher/AssignmentBuilder';
import Navbar from './components/Navbar';

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, userData, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRole && userData?.role !== allowedRole) {
    return <Navigate to={userData?.role === 'teacher' ? '/teacher' : '/student'} />;
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </>
  );
};

function App() {
  const { userData } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/teacher/*" element={
        <ProtectedRoute allowedRole="teacher">
          <Routes>
            <Route path="/" element={<TeacherDashboard />} />
            <Route path="class/:classId" element={<ClassDetails />} />
            <Route path="assignment/new" element={<AssignmentBuilder />} />
            <Route path="assignment/edit/:assignmentId" element={<AssignmentBuilder />} />
            <Route path="assignment/:assignmentId" element={<AssignmentDetails />} />
          </Routes>
        </ProtectedRoute>
      } />

      <Route path="/student/*" element={
        <ProtectedRoute allowedRole="student">
          <Routes>
            <Route path="/" element={<StudentDashboard />} />
            <Route path="class/:classId" element={<ClassDetails />} />
            <Route path="assignment/:assignmentId" element={<AssignmentDetails />} />
          </Routes>
        </ProtectedRoute>
      } />

      <Route path="/join/:classId" element={
        <ProtectedRoute allowedRole="student">
          <JoinClass />
        </ProtectedRoute>
      } />

      <Route path="/" element={
        userData ? (
          <Navigate to={userData.role === 'teacher' ? '/teacher' : '/student'} />
        ) : (
          <Navigate to="/login" />
        )
      } />
    </Routes>
  );
}

export default App;
