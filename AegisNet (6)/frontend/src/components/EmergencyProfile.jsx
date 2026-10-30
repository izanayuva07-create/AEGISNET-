import React, { useState, useEffect } from 'react';
import { UserCheck, HeartPulse, FileText, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { authApi } from '../services/api';

export default function EmergencyProfile({ user, onProfileUpdated }) {
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [emergencyInstructions, setEmergencyInstructions] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const data = await authApi.getProfile();
      if (data.user) {
        setName(data.user.name || '');
        setPhone(data.user.phone || '');
      }
      if (data.emergencyProfile) {
        setBloodGroup(data.emergencyProfile.blood_group || 'O+');
        setAllergies(data.emergencyProfile.allergies || '');
        setMedications(data.emergencyProfile.medications || '');
        setMedicalNotes(data.emergencyProfile.medical_notes || '');
        setEmergencyInstructions(data.emergencyProfile.emergency_instructions || '');
      }
    } catch (err) {
      console.warn('Could not load profile details:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await authApi.updateProfile({
        name,
        phone,
        blood_group: bloodGroup,
        allergies,
        medications,
        medical_notes: medicalNotes,
        emergency_instructions: emergencyInstructions
      });

      setSuccessMsg('Emergency profile and medical telemetry saved securely.');
      if (onProfileUpdated && res.user) {
        onProfileUpdated(res.user);
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update emergency profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading-indicator">Loading emergency profile...</div>;
  }

  return (
    <div className="profile-container">
      <div className="panel-header-section">
        <div className="header-info">
          <div className="badge-pill">
            <HeartPulse size={14} />
            <span>CRITICAL MEDICAL & IDENTITY TELEMETRY</span>
          </div>
          <h2>Emergency Profile</h2>
          <p className="subtitle">
            This confidential medical information is automatically transmitted to emergency responders upon SOS activation to expedite medical care.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="alert-box success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="alert-box error">
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="profile-form">
        {/* Section 1: Personal Details */}
        <div className="profile-card">
          <div className="card-title">
            <UserCheck size={18} className="gold-text" />
            <h3>Personal Information</h3>
          </div>

          <div className="form-grid-2">
            <label>
              Full Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label>
              Primary Mobile Phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </label>

            <label>
              Account Email
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="disabled-input"
              />
            </label>

            <label>
              Network Role
              <input
                type="text"
                value={(user?.role || 'Citizen').toUpperCase()}
                disabled
                className="disabled-input"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Medical Emergency Telemetry */}
        <div className="profile-card">
          <div className="card-title">
            <HeartPulse size={18} className="gold-text" />
            <h3>Medical Information (Optional but Critical)</h3>
          </div>

          <div className="form-grid-2">
            <label>
              Blood Group
              <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                <option value="A+">A Positive (A+)</option>
                <option value="A-">A Negative (A-)</option>
                <option value="B+">B Positive (B+)</option>
                <option value="B-">B Negative (B-)</option>
                <option value="AB+">AB Positive (AB+)</option>
                <option value="AB-">AB Negative (AB-)</option>
                <option value="O+">O Positive (O+)</option>
                <option value="O-">O Negative (O-)</option>
                <option value="Unknown">Not Specified</option>
              </select>
            </label>

            <label>
              Known Allergies
              <input
                type="text"
                placeholder="e.g. Penicillin, Peanuts, Latex, Dust"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row single">
            <label>
              Current Medications
              <input
                type="text"
                placeholder="e.g. Insulin, Beta-blockers, Inhaler, Aspirin"
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row single">
            <label>
              Medical History / Chronic Conditions
              <textarea
                placeholder="e.g. Asthma, Diabetes Type 2, Hypertension, Pacemaker fitted"
                value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
                rows={3}
              />
            </label>
          </div>

          <div className="form-row single">
            <label>
              Emergency Instructions for First Responders
              <textarea
                placeholder="e.g. Emergency medication in front bag pocket. Speak clearly in English or Tamil."
                value={emergencyInstructions}
                onChange={(e) => setEmergencyInstructions(e.target.value)}
                rows={2}
              />
            </label>
          </div>
        </div>

        <div className="form-actions-bar">
          <button type="submit" className="primary-btn" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving Profile...' : 'Save Emergency Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
