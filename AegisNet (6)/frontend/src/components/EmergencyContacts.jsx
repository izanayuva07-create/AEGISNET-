import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  AlertCircle,
  Phone,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { contactsApi } from '../services/api';

export default function EmergencyContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('Parent');
  const [consentGranted, setConsentGranted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    try {
      setLoading(true);
      setError('');
      const data = await contactsApi.getAll();
      setContacts(data.contacts || []);
    } catch (err) {
      setError(err.message || 'Failed to load emergency contacts.');
    } finally {
      setLoading(false);
    }
  }

  function flashSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  function startAdd() {
    setEditingId(null);
    setName('');
    setPhone('');
    setRelationship('Parent');
    setConsentGranted(false);
    setShowForm(true);
    setError('');
  }

  function startEdit(contact) {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone);
    setRelationship(contact.relationship);
    setConsentGranted(true);
    setShowForm(true);
    setError('');
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validations
    if (!name.trim() || name.trim().length < 2) {
      setError('Contact full name must have at least 2 characters.');
      return;
    }

    const cleanPhone = phone.trim();
    if (!/^\+?[0-9\s\-()]{8,18}$/.test(cleanPhone)) {
      setError('Please enter a valid phone number (minimum 8 digits, optional + country code).');
      return;
    }

    // Check duplicate phone locally before sending
    const duplicate = contacts.find(
      (c) => c.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '') && c.id !== editingId
    );
    if (duplicate) {
      setError(`This phone number is already registered under ${duplicate.name}.`);
      return;
    }

    if (!consentGranted) {
      setError('You must confirm authorization to store and dispatch emergency SMS notifications to this contact.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await contactsApi.update(editingId, {
          name: name.trim(),
          phone: cleanPhone,
          relationship
        });
        flashSuccess('Emergency contact updated successfully.');
      } else {
        if (contacts.length >= 5) {
          setError('A maximum of 5 emergency contacts is permitted.');
          setSubmitting(false);
          return;
        }
        await contactsApi.add({
          name: name.trim(),
          phone: cleanPhone,
          relationship,
          priority: contacts.length + 1
        });
        flashSuccess('New emergency contact registered and secured.');
      }
      setShowForm(false);
      setEditingId(null);
      await loadContacts();
    } catch (err) {
      setError(err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to remove this emergency contact?')) return;
    try {
      await contactsApi.delete(id);
      flashSuccess('Contact removed from emergency broadcast list.');
      await loadContacts();
    } catch (err) {
      setError(err.message || 'Failed to delete contact.');
    }
  }

  async function movePriority(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= contacts.length) return;

    const sourceContact = contacts[index];
    const targetContact = contacts[targetIndex];

    try {
      // Swap priorities
      await contactsApi.update(sourceContact.id, { priority: targetContact.priority });
      await contactsApi.update(targetContact.id, { priority: sourceContact.priority });
      flashSuccess('Emergency contact priority order updated.');
      await loadContacts();
    } catch (err) {
      setError(err.message || 'Failed to reorder contacts.');
    }
  }

  return (
    <div className="contacts-panel">
      <div className="panel-header-section">
        <div className="header-info">
          <div className="badge-pill">
            <Users size={14} />
            <span>EMERGENCY DISPATCH ROSTER</span>
          </div>
          <h2>Trusted Emergency Contacts</h2>
          <p className="subtitle">
            Configure up to <strong>5 priority contacts</strong> who will automatically receive an emergency SMS with your live GPS location whenever you trigger an SOS.
          </p>
        </div>

        <div className="header-actions">
          <button
            className="primary-btn"
            onClick={startAdd}
            disabled={contacts.length >= 5 || showForm}
          >
            <UserPlus size={16} /> Add Contact ({contacts.length}/5)
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="alert-box success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="alert-box error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Add / Edit Form Modal/Card */}
      {showForm && (
        <div className="contact-form-card">
          <div className="form-card-header">
            <h3>{editingId ? 'Edit Emergency Contact' : 'Register New Emergency Contact'}</h3>
            <span className="step-badge">Priority #{editingId ? contacts.find(c => c.id === editingId)?.priority : contacts.length + 1}</span>
          </div>

          <form onSubmit={handleSubmit} className="contact-form-grid">
            <div className="form-row">
              <label>
                Full Name *
                <input
                  type="text"
                  placeholder="e.g. Priya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>

              <label>
                Phone Number (with Country Code) *
                <input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </label>

              <label>
                Relationship *
                <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                  <option value="Parent">Parent</option>
                  <option value="Spouse">Spouse / Partner</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Child">Child / Dependent</option>
                  <option value="Friend">Close Friend</option>
                  <option value="Doctor">Personal Physician</option>
                  <option value="Colleague">Colleague / Neighbor</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>

            {/* Permission Verification Requirement */}
            <div className="consent-verification-box">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={consentGranted}
                  onChange={(e) => setConsentGranted(e.target.checked)}
                />
                <span>
                  <strong>Authorization & Privacy Verification:</strong> I confirm that I have informed this individual and have permission to register their contact number in AegisNet to receive automated emergency SMS notifications.
                </span>
              </label>
            </div>

            <div className="form-buttons">
              <button type="submit" className="primary-btn" disabled={submitting}>
                {submitting ? 'Securing Contact...' : editingId ? 'Update Contact' : 'Save Emergency Contact'}
              </button>
              <button type="button" className="secondary-btn" onClick={cancelForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contact Cards List */}
      <div className="contacts-list">
        {loading ? (
          <div className="loading-indicator">Loading contacts...</div>
        ) : contacts.length === 0 ? (
          <div className="empty-contacts-card">
            <Users size={36} className="muted-icon" />
            <h3>No Emergency Contacts Registered Yet</h3>
            <p>
              Please register your primary trusted emergency contacts (maximum 5). During any SOS incident, they will instantly receive a distress SMS with your live GPS coordinates and Google Maps pin.
            </p>
            <button className="primary-btn" onClick={startAdd}>
              <UserPlus size={16} /> Add First Contact
            </button>
          </div>
        ) : (
          contacts.map((contact, index) => (
            <div key={contact.id} className="contact-card">
              <div className="priority-badge-col">
                <span className="priority-number">#{contact.priority || index + 1}</span>
                <span className="priority-label">Priority</span>
              </div>

              <div className="contact-info-col">
                <div className="contact-main">
                  <h4 className="contact-name">{contact.name}</h4>
                  <span className="relationship-tag">{contact.relationship}</span>
                </div>
                <div className="contact-phone">
                  <Phone size={14} className="gold-text" />
                  <span>{contact.phone}</span>
                </div>
              </div>

              <div className="contact-reorder-col">
                <button
                  type="button"
                  className="reorder-btn"
                  title="Move Priority Up"
                  disabled={index === 0}
                  onClick={() => movePriority(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="reorder-btn"
                  title="Move Priority Down"
                  disabled={index === contacts.length - 1}
                  onClick={() => movePriority(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              <div className="contact-actions-col">
                <button
                  type="button"
                  className="action-icon-btn"
                  title="Edit Contact"
                  onClick={() => startEdit(contact)}
                >
                  <Edit2 size={15} />
                </button>
                <button
                  type="button"
                  className="action-icon-btn danger"
                  title="Remove Contact"
                  onClick={() => handleDelete(contact.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="security-notice-footer">
        <Lock size={14} className="gold-text" />
        <span>
          AegisNet encrypts all trusted contact records. Contact telephone numbers are strictly protected and never publicly exposed.
        </span>
      </div>
    </div>
  );
}
