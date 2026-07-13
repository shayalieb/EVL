import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CompleteProfilePage() {
  const { pendingGoogleProfile, completeGoogleProfile } = useAuth();
  const [phone, setPhone] = useState('');

  if (!pendingGoogleProfile) {
    return <Navigate to="/auth" replace />;
  }

  function handleSubmit(e) {
    e.preventDefault();
    completeGoogleProfile({ phone });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white text-2xl font-bold mb-3">
            {pendingGoogleProfile.firstName[0]}
          </div>
          <h1 className="text-xl font-bold text-slate-800">Complete your profile</h1>
          <p className="text-sm text-slate-500">
            Signed in as {pendingGoogleProfile.firstName} {pendingGoogleProfile.lastName} ({pendingGoogleProfile.email})
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-600">Contact phone number</label>
          <input
            type="tel"
            required
            placeholder="(555) 555-0100"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button type="submit" className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700">
            Finish Setting Up
          </button>
        </form>
      </div>
    </div>
  );
}
