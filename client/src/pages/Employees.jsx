import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import { can } from '../utils/access';
import api from '../utils/api';
import * as S from '../utils/styles';
import { generateEmployeeForm } from '../utils/pdfGenerator';
import { downloadCsv } from '../utils/exportCsv';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import FileUpload from '../components/FileUpload';
import { getIcon } from '../components/fileUploadUtils';

const TITLES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
const ACCOUNT_TYPES = ['Cheque', 'Savings', 'Transmission'];
const POSITIONS = ['Administrator', 'Human Resources', 'Consultant', 'Marketing', 'IT', 'Training/Trainee'];
const CITIES = ['Cape Town', 'Johannesburg', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'East London', 'Other'];
const BANKS = ['ABSA', 'African Bank', 'Bidvest Bank', 'Capitec', 'Discovery Bank', 'FNB', 'Investec', 'Nedbank', 'Standard Bank', 'TymeBank', 'Other'];
const RELATIONSHIPS = ['Spouse', 'Partner', 'Mother', 'Father', 'Daughter', 'Son', 'Sister', 'Brother', 'Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Cousin', 'Guardian', 'Friend', 'Other'];
const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility'];
const FOLDER_CATEGORIES = [
  { key: 'Identity',             icon: '', color: '#7c3aed', bg: '#f5f3ff', accent: '#7c3aed' },
  { key: 'Employment Contract',  icon: '', color: '#2563eb', bg: '#eff6ff', accent: '#2563eb' },
  { key: 'Banking',              icon: '', color: '#0891b2', bg: '#ecfeff', accent: '#0891b2' },
  { key: 'Medical',              icon: '', color: '#16a34a', bg: '#f0fdf4', accent: '#16a34a' },
  { key: 'Leave',                icon: '', color: '#0d9488', bg: '#f0fdfa', accent: '#0d9488' },
  { key: 'Disciplinary',         icon: '', color: '#d97706', bg: '#fffbeb', accent: '#d97706' },
  { key: 'Other',                icon: '', color: '#64748b', bg: '#f8fafc', accent: '#64748b' },
];

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const s = String(dateStr).split('T')[0];
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
};

export default function Employees() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [employees, setEmployees] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const LIMIT = 20;

  const [folderDocs, setFolderDocs] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState(null);
  const [uploadFolder, setUploadFolder] = useState(null);
  const [uploadDocType, setUploadDocType] = useState('');

  const [empLeave, setEmpLeave] = useState(null);
  const [empLeaveLoading, setEmpLeaveLoading] = useState(false);

  const [manualLeaves, setManualLeaves] = useState([]);
  const [addingManualLeave, setAddingManualLeave] = useState(false);
  const [manualLeaveForm, setManualLeaveForm] = useState({ leave_type: 'Annual', days: '', description: '' });
  const [manualLeaveSubmitting, setManualLeaveSubmitting] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUsers, setLinkUsers] = useState([]);
  const [selectedLinkUserId, setSelectedLinkUserId] = useState('');
  const [linkingUser, setLinkingUser] = useState(false);
  const [linkError, setLinkError] = useState('');

  const [warnings, setWarnings] = useState([]);
  const [warningsLoading, setWarningsLoading] = useState(false);
  const [showWarnForm, setShowWarnForm] = useState(false);
  const [warnForm, setWarnForm] = useState({ warning_type: 'Written Warning', reason: '', issued_date: '', notes: '' });
  const [savingWarn, setSavingWarn] = useState(false);
  const [deletingWarnId, setDeletingWarnId] = useState(null);

  const [empNotes, setEmpNotes] = useState([]);
  const [empNotesLoading, setEmpNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  // ─── Termination ───
  const [terminateModalOpen, setTerminateModalOpen] = useState(false);
  const [terminateForm, setTerminateForm] = useState({ termination_type: 'Resignation', termination_reason: '', termination_notes: '' });
  const [terminateSubmitting, setTerminateSubmitting] = useState(false);
  const [terminateError, setTerminateError] = useState('');

  const EMPTY_ADD = { first_name: '', last_name: '', job_title: '', email: '', home_phone: '', birth_date: '', franchise_id: '' };
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [addSaving, setAddSaving] = useState(false);

  const [bdayView, setBdayView] = useState(false);
  const [bdayYear, setBdayYear]   = useState(new Date().getFullYear());
  const [bdayMonth, setBdayMonth] = useState(new Date().getMonth());
  const [bdayEmployees, setBdayEmployees] = useState([]);
  const [bdayLoading, setBdayLoading] = useState(false);

  const [pastEmployees, setPastEmployees] = useState([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');

  useEffect(() => {
    fetchFranchises();
    if (user?.role !== 'Consultant') fetchPastEmployees();
  }, []);

  useEffect(() => {
    if (bdayView && bdayEmployees.length === 0) fetchBirthdayEmployees();
  }, [bdayView]);

  const fetchBirthdayEmployees = async () => {
    setBdayLoading(true);
    try {
      const res = await api.get('/employees/birthdays');
      setBdayEmployees(res.data);
    } catch (err) {
      console.error('Birthday fetch error:', err.response?.data || err.message);
    } finally { setBdayLoading(false); }
  };

  useEffect(() => { setPage(1); fetchEmployees(1); }, [search]);
  useEffect(() => { fetchEmployees(page); }, [page]);

  const handlePageChange = (p) => { setPage(p); window.scrollTo(0, 0); };

  const fetchEmployees = async (p = page) => {
    setLoading(true);
    try {
      const q = [];
      if (user?.role !== 'Admin' && user?.franchise_id) q.push(`franchise_id=${user.franchise_id}`);
      if (search.trim()) q.push(`search=${encodeURIComponent(search.trim())}`);
      q.push(`page=${p}`); q.push(`limit=${LIMIT}`);
      const res = await api.get(`/employees?${q.join('&')}`);
      setEmployees(res.data.data ? res.data.data : res.data);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch { setError('Failed to load employees.'); }
    finally { setLoading(false); }
  };

  const fetchFranchises = async () => {
    try { const res = await api.get('/franchises'); setFranchises(res.data); } catch { /* ignore */ }
  };

  const fetchLinkUsers = async () => {
    try { const res = await api.get('/users'); setLinkUsers(Array.isArray(res.data) ? res.data : []); } catch (err) { }
  };

  const handleOpenLink = async () => { setLinkError(''); setLinkModalOpen(true); if (linkUsers.length === 0) await fetchLinkUsers(); };

  const handleLinkUser = async () => {
    if (!selected) return;
    setLinkingUser(true); setLinkError(''); setSuccess('');
    try { const res = await api.patch(`/employees/${selected.id}/link-user`, { user_id: selectedLinkUserId || null }); setSelected(res.data); setEmployees(prev => prev.map(e => e.id === res.data.id ? res.data : e)); setSuccess(selectedLinkUserId ? 'Account linked.' : 'Account unlinked.'); setLinkModalOpen(false); setSelectedLinkUserId(''); }
    catch (err) { setLinkError(err.response?.data?.error || 'Failed to link account.'); }
    finally { setLinkingUser(false); }
  };

  const handleUnlink = async () => {
    if (!selected || !window.confirm('Unlink user account from this employee?')) return;
    setLinkingUser(true); setLinkError('');
    try { const res = await api.patch(`/employees/${selected.id}/link-user`, { user_id: null }); setSelected(res.data); setEmployees(prev => prev.map(e => e.id === res.data.id ? res.data : e)); setSuccess('Account unlinked.'); }
    catch (err) { setLinkError(err.response?.data?.error || 'Failed to unlink account.'); }
    finally { setLinkingUser(false); }
  };

  const fetchPastEmployees = async () => { setPastLoading(true); try { const res = await api.get('/employees/terminated'); setPastEmployees(Array.isArray(res.data) ? res.data : []); } catch { } finally { setPastLoading(false); } };

  const openDetail = (emp) => {
    if (user?.role !== 'Admin' && emp?.user_id !== user?.id) { setError('Access denied. You can only view your own employee record.'); return; }
    setSelected(emp); setView('detail'); setError(''); setSuccess(''); setActiveFolder(null); setUploadFolder(null); setUploadDocType('');
    setFolderDocs([]); setEmpLeave(null); setManualLeaves([]); setAddingManualLeave(false);
    setWarnings([]); setShowWarnForm(false); setWarnForm({ warning_type: 'Written Warning', reason: '', issued_date: '', notes: '' });
    setEmpNotes([]); setNewNote(''); setNoteError('');
    if (user?.role !== 'Consultant') {
      setFolderLoading(true); fetchFolderDocs(emp.id); fetchEmpLeave(emp.id);
      if (user?.role === 'Admin') fetchManualLeaves(emp.id);
      if (user?.role === 'Admin' || user?.role === 'HR') { fetchWarnings(emp.id); fetchEmpNotes(emp.id); }
    }
  };

  const fetchWarnings = async (empId) => { setWarningsLoading(true); try { const res = await api.get(`/employees/${empId}/warnings`); setWarnings(Array.isArray(res.data) ? res.data : []); } catch { } finally { setWarningsLoading(false); } };
  const fetchEmpNotes = async (empId) => { setEmpNotesLoading(true); try { const res = await api.get(`/employees/${empId}/notes`); setEmpNotes(Array.isArray(res.data) ? res.data : []); } catch { } finally { setEmpNotesLoading(false); } };

  const handlePostEmpNote = async () => { if (!newNote.trim() || postingNote) return; setPostingNote(true); setNoteError(''); try { const res = await api.post(`/employees/${selected.id}/notes`, { note: newNote.trim() }); setEmpNotes(prev => [res.data, ...prev]); setNewNote(''); } catch (err) { setNoteError(err.response?.data?.error || 'Failed to post note.'); } finally { setPostingNote(false); } };
  const handleDeleteEmpNote = async (noteId) => { try { await api.delete(`/employees/${selected.id}/notes/${noteId}`); setEmpNotes(prev => prev.filter(n => n.id !== noteId)); } catch { } };

  const handleSaveWarning = async () => { if (!warnForm.reason.trim() || savingWarn) return; setSavingWarn(true); try { const res = await api.post(`/employees/${selected.id}/warnings`, warnForm); setWarnings(prev => [res.data, ...prev]); setShowWarnForm(false); setWarnForm({ warning_type: 'Written Warning', reason: '', issued_date: '', notes: '' }); } catch (err) { setError(err.response?.data?.error || 'Failed to save warning.'); } finally { setSavingWarn(false); } };
  const handleDeleteWarning = async (warnId) => { setDeletingWarnId(warnId); try { await api.delete(`/employees/${selected.id}/warnings/${warnId}`); setWarnings(prev => prev.filter(w => w.id !== warnId)); } catch { } finally { setDeletingWarnId(null); } };

  const handleAddEmployee = async () => { if (!addForm.first_name.trim() || !addForm.last_name.trim()) { setError('First name and last name are required.'); return; } setAddSaving(true); setError(''); try { const payload = { ...addForm, franchise_id: addForm.franchise_id || user?.franchise_id || undefined }; const res = await api.post('/employees', payload); setEmployees(prev => [res.data, ...prev]); setView('list'); setAddForm(EMPTY_ADD); setSuccess('Employee added successfully.'); } catch (err) { setError(err.response?.data?.error || 'Failed to add employee.'); } finally { setAddSaving(false); } };

  const fetchFolderDocs = async (employeeId) => { setFolderLoading(true); try { const res = await api.get(`/documents/employee-folder/${employeeId}`); setFolderDocs(Array.isArray(res.data) ? res.data : []); } catch { } finally { setFolderLoading(false); } };
  const fetchEmpLeave = async (employeeId) => { setEmpLeaveLoading(true); try { const res = await api.get(`/leave/employee/${employeeId}`); setEmpLeave(res.data); } catch { } finally { setEmpLeaveLoading(false); } };
  const fetchManualLeaves = async (employeeId) => { try { const res = await api.get(`/leave/manual/${employeeId}`); setManualLeaves(Array.isArray(res.data) ? res.data : []); } catch { } };

  const handleAddManualLeave = async () => { if (!manualLeaveForm.days || parseFloat(manualLeaveForm.days) <= 0) return; setManualLeaveSubmitting(true); try { await api.post('/leave/manual', { employee_id: selected.id, leave_type: manualLeaveForm.leave_type, days: parseFloat(manualLeaveForm.days), description: manualLeaveForm.description, year: new Date().getFullYear() }); setManualLeaveForm({ leave_type: 'Annual', days: '', description: '' }); setAddingManualLeave(false); fetchManualLeaves(selected.id); fetchEmpLeave(selected.id); } catch { } finally { setManualLeaveSubmitting(false); } };
  const handleDeleteManualLeave = async (id) => { try { await api.delete(`/leave/manual/${id}`); setManualLeaves(prev => prev.filter(m => m.id !== id)); fetchEmpLeave(selected.id); } catch { } };

  // ─── Termination ───
  const handleTerminate = async () => {
    if (!terminateForm.termination_reason.trim()) { setTerminateError('Reason is required.'); return; }
    setTerminateSubmitting(true); setTerminateError('');
    try {
      await api.patch(`/employees/${selected.id}/terminate`, terminateForm);
      setTerminateModalOpen(false);
      setTerminateForm({ termination_type: 'Resignation', termination_reason: '', termination_notes: '' });
      setSuccess(`${selected.first_name} ${selected.last_name} has been terminated.`);
      setView('list');
      setSelected(null);
      fetchEmployees(page);
      fetchPastEmployees();
    } catch (err) {
      setTerminateError(err.response?.data?.error || 'Failed to terminate employee.');
    } finally { setTerminateSubmitting(false); }
  };

  const handleFolderDocDelete = async (docId) => { if (!window.confirm('Delete this document?')) return; try { await api.delete(`/documents/folder/${docId}`); setFolderDocs(prev => prev.filter(d => d.id !== docId)); } catch { } };
  const getDocDownloadUrl = async (key) => { try { const res = await api.get(`/documents/download/${encodeURIComponent(key)}`); window.open(res.data.url, '_blank'); } catch { } };

  const openEdit = (emp) => { setSelected(emp); setForm({ ...emp }); setView('edit'); setError(''); setSuccess(''); };

  const handleSave = async () => { if (!form.first_name) { setError('First name is required.'); return; } setSaving(true); setError(''); setSuccess(''); try { const res = await api.patch(`/employees/${selected.id}`, form); setSelected(res.data); setEmployees(prev => prev.map(e => e.id === res.data.id ? res.data : e)); setSuccess('Employee updated successfully.'); setView('detail'); } catch (err) { setError(err.response?.data?.error || 'Failed to save changes.'); } finally { setSaving(false); } };

  const f = (key) => form[key] || '';
  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const setDate = (key) => (val) => setForm(p => ({ ...p, [key]: val }));

  const toDateInput = (val) => { if (!val) return ''; const s = String(val).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; if (s.includes('T')) return s.split('T')[0]; if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; } if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-'); return s.substring(0, 10); };

  const filtered = employees;

  // ── EDIT VIEW ──────────────────────────────────────────
  if (view === 'edit') {
    return (
      <div style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => { setView('detail'); setError(''); }} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>← Back</button>
            <h2 style={{ ...S.pageTitle, margin: 0 }}>Edit — {selected?.first_name} {selected?.last_name}</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setView('detail'); setError(''); }} style={S.ghostBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.primaryBtn, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
        {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormSection title="Personal Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '14px' }}>
              <FormField label="Title"><select value={f('title')} onChange={set('title')} style={S.input}><option value="">—</option>{TITLES.map(t => <option key={t}>{t}</option>)}</select></FormField>
              <FormField label="First Name *" span={isMobile ? 1 : 3}><input value={f('first_name')} onChange={set('first_name')} style={S.input} /></FormField>
              <FormField label="Last Name" span={isMobile ? 1 : 2}><input value={f('last_name')} onChange={set('last_name')} style={S.input} /></FormField>
              <FormField label="ID Number" span={isMobile ? 1 : 2}><input value={f('id_number')} onChange={set('id_number')} style={S.input} maxLength={13} /></FormField>
              <FormField label="Tax Number"><input value={f('tax_number')} onChange={set('tax_number')} style={S.input} /></FormField>
              <FormField label="Date of Birth"><DatePicker value={toDateInput(f('birth_date'))} onChange={setDate('birth_date')} /></FormField>
              <FormField label="Marital Status"><select value={f('marital_status')} onChange={set('marital_status')} style={S.input}><option value="">—</option>{MARITAL.map(m => <option key={m}>{m}</option>)}</select></FormField>
              <FormField label="Position"><select value={f('job_title')} onChange={set('job_title')} style={S.input}><option value="">—</option>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></FormField>
              <FormField label="Employment Date"><DatePicker value={toDateInput(f('employment_date'))} onChange={setDate('employment_date')} /></FormField>
            </div>
          </FormSection>
          <FormSection title="Contact Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '14px' }}>
              <FormField label="Email" span={isMobile ? 1 : 2}><input type="email" value={f('email')} onChange={set('email')} style={S.input} /></FormField>
              <FormField label="Cell"><input value={f('cell')} onChange={set('cell')} style={S.input} placeholder="e.g. 082 123 4567" /></FormField>
              <FormField label="WhatsApp"><input value={f('whatsapp')} onChange={set('whatsapp')} style={S.input} /></FormField>
              <FormField label="Home Phone"><input value={f('home_phone')} onChange={set('home_phone')} style={S.input} /></FormField>
              <FormField label="Alternate Phone"><input value={f('alternate_phone')} onChange={set('alternate_phone')} style={S.input} /></FormField>
            </div>
          </FormSection>
          <FormSection title="Address">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr', gap: '14px' }}>
              <FormField label="Street Address"><input value={f('address_street')} onChange={set('address_street')} style={S.input} /></FormField>
              <FormField label="City">{(() => { const PRESET = CITIES.filter(c => c !== 'Other'); const isOther = f('address_city') !== '' && !PRESET.includes(f('address_city')); const dropdownVal = isOther ? 'Other' : f('address_city'); return (<><select value={dropdownVal} onChange={e => { if (e.target.value === 'Other') setForm(p => ({ ...p, address_city: '__other__' })); else setForm(p => ({ ...p, address_city: e.target.value })); }} style={S.input}><option value="">— Select city —</option>{CITIES.map(c => <option key={c} value={c}>{c}</option>)}</select>{(isOther || f('address_city') === '__other__') && <input value={f('address_city') === '__other__' ? '' : f('address_city')} onChange={set('address_city')} placeholder="Enter city name" style={{ ...S.input, marginTop: '6px' }} autoFocus />}</>); })()}</FormField>
              <FormField label="Postal Code"><input value={f('postal_code')} onChange={set('postal_code')} style={S.input} /></FormField>
            </div>
          </FormSection>
          <FormSection title="Health"><FormField label="Allergies / Health Concerns"><textarea value={f('allergies_health_concerns')} onChange={set('allergies_health_concerns')} rows={3} style={{ ...S.input, resize: 'vertical' }} placeholder="None" /></FormField></FormSection>
          <FormSection title="Emergency Contact">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '14px' }}>
              <FormField label="Title"><select value={f('ec_title')} onChange={set('ec_title')} style={S.input}><option value="">—</option>{TITLES.map(t => <option key={t}>{t}</option>)}</select></FormField>
              <FormField label="First Name"><input value={f('ec_first_name')} onChange={set('ec_first_name')} style={S.input} /></FormField>
              <FormField label="Last Name"><input value={f('ec_last_name')} onChange={set('ec_last_name')} style={S.input} /></FormField>
              <FormField label="Relationship"><select value={f('ec_relationship')} onChange={set('ec_relationship')} style={S.input}><option value="">— Select —</option>{RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}</select></FormField>
              <FormField label="Primary Phone"><input value={f('ec_primary_phone')} onChange={set('ec_primary_phone')} style={S.input} /></FormField>
              <FormField label="Alternate Phone"><input value={f('ec_alternate_phone')} onChange={set('ec_alternate_phone')} style={S.input} /></FormField>
              <div style={{ gridColumn: isMobile ? 'span 2' : 'span 3' }}><FormField label="Address"><input value={f('ec_address')} onChange={set('ec_address')} style={S.input} /></FormField></div>
            </div>
          </FormSection>
          <FormSection title="Secondary Emergency Contact">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '14px' }}>
              <FormField label="Title"><select value={f('sec_title')} onChange={set('sec_title')} style={S.input}><option value="">—</option>{TITLES.map(t => <option key={t}>{t}</option>)}</select></FormField>
              <FormField label="First Name"><input value={f('sec_first_name')} onChange={set('sec_first_name')} style={S.input} /></FormField>
              <FormField label="Last Name"><input value={f('sec_last_name')} onChange={set('sec_last_name')} style={S.input} /></FormField>
              <FormField label="Relationship"><select value={f('sec_relationship')} onChange={set('sec_relationship')} style={S.input}><option value="">— Select —</option>{RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}</select></FormField>
              <FormField label="Primary Phone"><input value={f('sec_primary_phone')} onChange={set('sec_primary_phone')} style={S.input} /></FormField>
              <FormField label="Alternate Phone"><input value={f('sec_alternate_phone')} onChange={set('sec_alternate_phone')} style={S.input} /></FormField>
              <div style={{ gridColumn: isMobile ? 'span 2' : 'span 3' }}><FormField label="Address"><input value={f('sec_address')} onChange={set('sec_address')} style={S.input} /></FormField></div>
            </div>
          </FormSection>
          <FormSection title="Banking & Payment Details">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '14px' }}>
              <FormField label="Bank Name"><select value={f('bank_name')} onChange={set('bank_name')} style={S.input}><option value="">— Select bank —</option>{BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></FormField>
              <FormField label="Account Name"><input value={f('account_name')} onChange={set('account_name')} style={S.input} /></FormField>
              <FormField label="Account Number"><input value={f('account_number')} onChange={set('account_number')} style={S.input} /></FormField>
              <FormField label="Account Type"><select value={f('account_type')} onChange={set('account_type')} style={S.input}><option value="">—</option>{ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}</select></FormField>
              <FormField label="Branch Name"><input value={f('branch_name')} onChange={set('branch_name')} style={S.input} /></FormField>
              <FormField label="Branch Code"><input value={f('branch_code')} onChange={set('branch_code')} style={S.input} /></FormField>
            </div>
          </FormSection>
          {user?.role === 'Admin' ? (
            <FormSection title="Assignment"><FormField label="Franchise"><select value={f('franchise_id')} onChange={set('franchise_id')} style={S.input}><option value="">— Unassigned —</option>{franchises.map(fr => (<option key={fr.id} value={fr.id}>{fr.franchise_name}</option>))}</select></FormField></FormSection>
          ) : selected?.franchise_name ? (
            <FormSection title="Assignment"><FormField label="Franchise"><input value={selected.franchise_name} disabled style={{ ...S.input, background: '#f8fafc', color: '#64748b' }} /></FormField></FormSection>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={() => { setView('detail'); setError(''); }} style={S.ghostBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...S.primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    );
  }

  // ── ADD EMPLOYEE VIEW ──
  if (view === 'add') {
    return (
      <div style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><button onClick={() => { setView('list'); setError(''); setAddForm(EMPTY_ADD); }} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>← Back</button><h2 style={{ ...S.pageTitle, margin: 0 }}>Add Employee</h2></div>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>No user account required — you can link one later</p>
        </div>
        {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'visible' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Basic Details</p></div>
          <div style={{ padding: '22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div><label>First Name *</label><input value={addForm.first_name} onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" style={S.input} /></div>
            <div><label>Last Name *</label><input value={addForm.last_name} onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" style={S.input} /></div>
            <div><label>Position</label><select value={addForm.job_title} onChange={e => setAddForm(p => ({ ...p, job_title: e.target.value }))} style={S.input}><option value="">— Select —</option>{POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label>Email</label><input type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={S.input} /></div>
            <div><label>Cell / Phone</label><input value={addForm.home_phone} onChange={e => setAddForm(p => ({ ...p, home_phone: e.target.value }))} placeholder="0821234567" style={S.input} /></div>
            <div><label>Date of Birth</label><DatePicker value={addForm.birth_date} onChange={v => setAddForm(p => ({ ...p, birth_date: v }))} /></div>
            {user?.role === 'Admin' && franchises.length > 0 && <div style={{ gridColumn: 'span 2' }}><label>Branch / Franchise</label><select value={addForm.franchise_id} onChange={e => setAddForm(p => ({ ...p, franchise_id: e.target.value }))} style={S.input}><option value="">— Auto (your branch) —</option>{franchises.map(f => <option key={f.id} value={f.id}>{f.franchise_name}</option>)}</select></div>}
            <div style={{ gridColumn: 'span 2', background: '#f0fdf4', borderRadius: '8px', padding: '12px 14px', border: '1px solid #bbf7d0' }}><p style={{ margin: 0, fontSize: '12.5px', color: '#166534' }}><strong>No login profile needed.</strong> This employee record will be created immediately. You can link it to a user account later from the employee's detail page.</p></div>
          </div>
          <div style={{ padding: '16px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><button onClick={() => { setView('list'); setError(''); setAddForm(EMPTY_ADD); }} style={S.ghostBtn}>Cancel</button><button onClick={handleAddEmployee} disabled={addSaving || !addForm.first_name.trim() || !addForm.last_name.trim()} style={{ ...S.primaryBtn, opacity: (addSaving || !addForm.first_name.trim() || !addForm.last_name.trim()) ? 0.6 : 1 }}>{addSaving ? 'Saving...' : 'Add Employee'}</button></div>
        </div>
      </div>
    );
  }

  // ── CONSULTANT DETAIL VIEW ──
  if (view === 'detail' && selected && user?.role === 'Consultant') {
    return (
      <div style={{ maxWidth: '600px' }}>
        <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: '0 0 16px' }}>← Back</button>
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><h2 style={{ ...S.pageTitle, fontSize: '16px', margin: 0 }}>{selected.title} {selected.first_name} {selected.last_name}</h2>{selected.job_title && <p style={{ color: '#64748b', fontSize: '12px', margin: '3px 0 0' }}>{selected.job_title}</p>}</div>
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>{[{ label: 'Email', value: selected.email }, { label: 'Cell', value: selected.cell }, { label: 'WhatsApp', value: selected.whatsapp }, { label: 'Branch', value: selected.franchise_name }].filter(r => r.value).map(r => (<div key={r.label} style={{ display: 'flex', gap: '16px' }}><span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', width: '80px', flexShrink: 0, paddingTop: '1px' }}>{r.label}</span><span style={{ color: '#0f172a', fontSize: '13.5px' }}>{r.value}</span></div>))}</div>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (view === 'detail' && selected) {
    return (
      <div style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>← Back</button><h2 style={{ ...S.pageTitle, margin: 0 }}>{selected.title} {selected.first_name} {selected.last_name}</h2></div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={async () => await generateEmployeeForm(selected)} style={S.ghostBtn}>PDF</button>
            {(user?.role === 'Admin' || selected?.user_id === user?.id) && <button onClick={() => openEdit(selected)} style={S.primaryBtn}>Edit Details</button>}
            {user?.role === 'Admin' && (<>{selected?.user_id ? (<><button onClick={handleUnlink} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>Unlink Account</button><button onClick={handleOpenLink} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '9px 14px', color: '#94a3b8', fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer' }}>Change Link</button></>) : <button onClick={handleOpenLink} style={S.primaryBtn}>Link Account</button>}</>)}
            {user?.role === 'Admin' && <button onClick={() => { setTerminateModalOpen(true); setTerminateError(''); setTerminateForm({ termination_type: 'Resignation', termination_reason: '', termination_notes: '' }); }} style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '8px', padding: '9px 14px', color: '#dc2626', fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer' }}>Terminate</button>}
          </div>
        </div>
        {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}
        {linkModalOpen && (<div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}><p style={{ margin: '0 0 8px', fontWeight: '700' }}>Link user account</p>{linkError && <p style={{ color: '#dc2626', margin: '6px 0' }}>{linkError}</p>}<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><select value={selectedLinkUserId} onChange={e => setSelectedLinkUserId(e.target.value)} style={{ ...S.input, flex: 1 }}><option value="">— Select user —</option>{linkUsers.map(u => (<option key={u.id} value={u.id}>@{u.username} {u.role ? `(${u.role})` : ''}</option>))}</select><button onClick={handleLinkUser} disabled={linkingUser} style={{ ...S.primaryBtn, opacity: linkingUser ? 0.7 : 1 }}>{linkingUser ? 'Linking...' : 'Link'}</button><button onClick={() => { setLinkModalOpen(false); setSelectedLinkUserId(''); }} style={S.ghostBtn}>Cancel</button></div></div>)}

        {/* Terminate Modal */}
        {terminateModalOpen && (
          <div style={{ background: 'white', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
            <p style={{ margin: '0 0 12px', fontWeight: '700', fontSize: '14px', color: '#991b1b' }}>
              Terminate {selected?.first_name} {selected?.last_name}
            </p>
            {terminateError && <p style={{ color: '#dc2626', fontSize: '12px', margin: '0 0 10px', background: '#fef2f2', padding: '8px 10px', borderRadius: '6px' }}>{terminateError}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '4px', fontWeight: '500' }}>Type</label>
                <select value={terminateForm.termination_type} onChange={e => setTerminateForm(p => ({ ...p, termination_type: e.target.value }))} style={S.input}>
                  <option value="Resignation">Resignation</option>
                  <option value="Dismissal">Dismissal</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '4px', fontWeight: '500' }}>Reason *</label>
                <textarea value={terminateForm.termination_reason} onChange={e => setTerminateForm(p => ({ ...p, termination_reason: e.target.value }))} placeholder="Describe the reason for leaving or dismissal..." rows={3} style={{ ...S.input, resize: 'vertical', lineHeight: '1.5' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '4px', fontWeight: '500' }}>Additional Notes (optional)</label>
                <textarea value={terminateForm.termination_notes} onChange={e => setTerminateForm(p => ({ ...p, termination_notes: e.target.value }))} placeholder="Any additional context..." rows={2} style={{ ...S.input, resize: 'vertical', lineHeight: '1.5' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setTerminateModalOpen(false); setTerminateError(''); }} style={S.ghostBtn}>Cancel</button>
              <button onClick={handleTerminate} disabled={terminateSubmitting || !terminateForm.termination_reason.trim()} style={{ ...S.primaryBtn, background: 'linear-gradient(135deg,#dc2626,#991b1b)', boxShadow: '0 2px 8px rgba(220,38,38,0.25)', opacity: (terminateSubmitting || !terminateForm.termination_reason.trim()) ? 0.6 : 1 }}>{terminateSubmitting ? 'Terminating...' : 'Confirm Termination'}</button>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '3px', gap: '2px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['overview', 'financial', 'vault', 'leave'].map(tab => (
            <button key={tab} onClick={() => setDetailTab(tab)}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '600',
                fontFamily: 'DM Sans', cursor: 'pointer', textTransform: 'capitalize',
                background: detailTab === tab ? 'white' : 'transparent',
                color: detailTab === tab ? '#0f172a' : '#64748b',
                boxShadow: detailTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                minHeight: '38px',
              }}>
              {tab === 'overview' ? 'Overview & Contact' : tab === 'financial' ? 'Financial & Banking' : tab === 'vault' ? 'HR Vault' : 'Leave & History'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Overview & Contact */}
          {detailTab === 'overview' && <>
          <DetailSection title="Personal Details" data={[{ label: 'Title', value: selected.title }, { label: 'Full Name', value: `${selected.first_name || ''} ${selected.last_name || ''}`.trim() }, { label: 'ID Number', value: selected.id_number }, { label: 'Tax Number', value: selected.tax_number }, { label: 'Date of Birth', value: fmtDate(selected.birth_date) }, { label: 'Marital Status', value: selected.marital_status }, { label: 'Position', value: selected.job_title }, { label: 'Employment Date', value: fmtDate(selected.employment_date) }, { label: 'Franchise', value: selected.franchise_name }]} />
          <DetailSection title="Contact" data={[{ label: 'Email', value: selected.email }, { label: 'Cell', value: selected.cell }, { label: 'WhatsApp', value: selected.whatsapp }, { label: 'Home Phone', value: selected.home_phone }, { label: 'Alternate Phone', value: selected.alternate_phone }]} />
          <DetailSection title="Address" data={[{ label: 'Street', value: selected.address_street }, { label: 'City', value: selected.address_city }, { label: 'Postal Code', value: selected.postal_code }]} />
          <DetailSection title="Emergency Contact" data={[{ label: 'Name', value: `${selected.ec_title || ''} ${selected.ec_first_name || ''} ${selected.ec_last_name || ''}`.trim() }, { label: 'Relationship', value: selected.ec_relationship }, { label: 'Primary Phone', value: selected.ec_primary_phone }, { label: 'Alternate Phone', value: selected.ec_alternate_phone }, { label: 'Address', value: selected.ec_address }]} />
          <DetailSection title="Secondary Emergency Contact" data={[{ label: 'Name', value: `${selected.sec_title || ''} ${selected.sec_first_name || ''} ${selected.sec_last_name || ''}`.trim() }, { label: 'Relationship', value: selected.sec_relationship }, { label: 'Primary Phone', value: selected.sec_primary_phone }, { label: 'Alternate Phone', value: selected.sec_alternate_phone }, { label: 'Address', value: selected.sec_address }]} />
          <DetailSection title="Health" data={[{ label: 'Allergies / Health Concerns', value: selected.allergies_health_concerns || 'None' }]} />
          </>}

          {/* Financial & Banking */}
          {detailTab === 'financial' && <>
          <DetailSection title="Banking & Payment" data={[{ label: 'Bank', value: selected.bank_name }, { label: 'Account Name', value: selected.account_name }, { label: 'Account Number', value: selected.account_number }, { label: 'Account Type', value: selected.account_type }, { label: 'Branch Name', value: selected.branch_name }, { label: 'Branch Code', value: selected.branch_code }]} />
          </>}

          {/* Leave & History */}
          {detailTab === 'leave' && <>
          {can(user, 'leave.viewAll') && (
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Leave Overview</p><span style={{ color: '#94a3b8', fontSize: '11px' }}>{new Date().getFullYear()}</span></div>
              {empLeaveLoading ? <p style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Loading...</p> : !empLeave ? <p style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>No leave data found.</p> : (<div><div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>{[{ label: 'Annual', total: empLeave.balance?.annual_total, used: empLeave.balance?.annual_used, color: '#2563eb' }, { label: 'Sick', total: empLeave.balance?.sick_total, used: empLeave.balance?.sick_used, color: '#0891b2' }, { label: 'Family Resp.', total: empLeave.balance?.family_total, used: empLeave.balance?.family_used, color: '#16a34a' }].map(lb => (<div key={lb.label} style={{ flex: '1', padding: '14px 20px', borderRight: '1px solid #f1f5f9', minWidth: '90px' }}><p style={{ margin: '0 0 4px', fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lb.label}</p><p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: lb.color }}>{(lb.total ?? 0) - (lb.used ?? 0)}<span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>/{lb.total ?? 0}</span></p><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{lb.used ?? 0} used</p></div>))}</div>{empLeave.requests?.length > 0 ? empLeave.requests.map((r, i) => (<div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', borderTop: i > 0 ? '1px solid #f8fafc' : 'none', gap: '12px' }}><div style={{ flex: 1 }}><span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{r.leave_type}</span><span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{fmtDate(r.start_date)} &rarr; {fmtDate(r.end_date)} &middot; {r.days_requested}d</span></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}><span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', background: r.status === 'Approved' ? '#f0fdf4' : r.status === 'Rejected' ? '#fef2f2' : '#fffbeb', color: r.status === 'Approved' ? '#16a34a' : r.status === 'Rejected' ? '#dc2626' : '#d97706' }}>{r.status}</span><span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmtDate(r.created_at)} {new Date(r.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span></div></div>)) : <p style={{ padding: '14px 20px', color: '#94a3b8', fontSize: '12px', margin: 0, fontStyle: 'italic' }}>No leave requests on record.</p>}</div>)}
            </div>
          )}

          {user?.role === 'Admin' && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><div><h3 style={{ fontFamily: 'Sora', fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 2px' }}>Past Leave Records</h3><p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Manual adjustments — deducted from current year balance</p></div><button onClick={() => setAddingManualLeave(v => !v)} style={{ background: addingManualLeave ? '#f1f5f9' : 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: '8px', padding: '7px 14px', color: addingManualLeave ? '#64748b' : 'white', fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer' }}>{addingManualLeave ? 'Cancel' : '+ Add Entry'}</button></div>
              {addingManualLeave && (<div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e4e8f0', padding: '16px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}><div><label>Leave Type</label><select value={manualLeaveForm.leave_type} onChange={e => setManualLeaveForm(p => ({ ...p, leave_type: e.target.value }))} style={S.input}>{LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div><label>Days Taken</label><input type="number" min="0.5" step="0.5" value={manualLeaveForm.days} onChange={e => setManualLeaveForm(p => ({ ...p, days: e.target.value }))} placeholder="e.g. 3" style={S.input} /></div><div><label>Description</label><input value={manualLeaveForm.description} onChange={e => setManualLeaveForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Taken Jan 2025" style={S.input} /></div></div><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={handleAddManualLeave} disabled={manualLeaveSubmitting || !manualLeaveForm.days} style={{ ...S.primaryBtn, opacity: (!manualLeaveForm.days || manualLeaveSubmitting) ? 0.6 : 1 }}>{manualLeaveSubmitting ? 'Saving...' : 'Save Entry'}</button></div></div>)}
              {manualLeaves.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>No past leave entries recorded.</p> : <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e4e8f0', overflow: 'hidden' }}>{manualLeaves.map((m, i) => (<div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', gap: '12px' }}><div style={{ flex: 1 }}><span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{m.leave_type}</span><span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '700', marginLeft: '8px' }}>−{m.days}d</span>{m.description && <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{m.description}</span>}</div><span style={{ color: '#94a3b8', fontSize: '11px' }}>{m.year} · {m.created_by_username}</span><button onClick={() => handleDeleteManualLeave(m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>Remove</button></div>))}</div>}
            </div>
          )}

          </>}

          {/* HR Vault */}
          {detailTab === 'vault' && <>
          {(user?.role === 'Admin' || selected?.user_id === user?.id) && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}><div><h3 style={{ fontFamily: 'Sora', fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 2px' }}>Document Vault</h3><p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Private — visible to HR and Admin only</p></div><span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>Confidential</span></div>
              {folderLoading ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading folder...</p> : (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{FOLDER_CATEGORIES.map(cat => { const catDocs = folderDocs.filter(d => d.folder_category === cat.key); const isOpen = activeFolder === cat.key; const isUploading = uploadFolder === cat.key; return (<div key={cat.key} style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #f1f5f9', borderLeft: `3px solid ${cat.accent}` }}><div onClick={() => setActiveFolder(isOpen ? null : cat.key)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: isOpen ? cat.bg : 'white', transition: 'background 0.15s' }}><div style={{ flex: 1 }}><span style={{ fontWeight: '600', fontSize: '13.5px', color: '#0f172a' }}>{cat.key}</span>{catDocs.length > 0 && <span style={{ marginLeft: '8px', background: cat.bg, color: cat.color, borderRadius: '10px', fontSize: '10px', fontWeight: '700', padding: '1px 7px' }}>{catDocs.length}</span>}</div><span style={{ color: '#94a3b8', fontSize: '12px' }}>{isUploading ? 'Uploading...' : (isOpen ? 'Collapse' : 'Expand')}</span></div>{isOpen && (<div style={{ borderTop: `1px solid ${cat.bg}`, padding: '14px 16px' }}><div style={{ marginBottom: '14px' }}><div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}><input value={uploadDocType} onChange={e => setUploadDocType(e.target.value)} placeholder={`Document name (e.g. ${cat.key === 'Identity' ? 'SA ID Copy' : cat.key === 'Employment Contract' ? 'Signed Employment Contract' : cat.key === 'Banking' ? 'Bank Statement' : cat.key === 'Medical' ? 'Medical Certificate' : cat.key === 'Leave' ? 'Sick Note / Leave Certificate' : cat.key === 'Disciplinary' ? 'Written Warning' : 'Document'})`} style={{ flex: 1, padding: '8px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', fontFamily: 'DM Sans', color: '#0f172a' }} /></div><FileUpload uploadUrl={`/documents/employee-folder/${selected.id}`} extraFields={{ folder_category: cat.key, doc_type: uploadDocType || cat.key }} onUploadStart={() => setUploadFolder(cat.key)} onUploadComplete={(doc) => { setFolderDocs(prev => [doc, ...prev]); setUploadDocType(''); setUploadFolder(null); }} label={`Upload to ${cat.key}`} compact /></div>{catDocs.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, fontStyle: 'italic' }}>No documents in this folder yet.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{catDocs.map(doc => (<div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9' }}><span style={{ fontSize: '20px', flexShrink: 0 }}>{getIcon(doc.file_name)}</span><div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: '0 0 1px', fontSize: '12.5px', fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.doc_type || doc.file_name}</p><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{doc.file_name} · {fmtDate(doc.uploaded_at)} {new Date(doc.uploaded_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</p></div><div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}><button onClick={() => getDocDownloadUrl(doc.file_key)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>Download</button><button onClick={() => handleFolderDocDelete(doc.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>Delete</button></div></div>))}</div>}</div>)}</div>); })}</div>)}
            </div>
          )}

          {(user?.role === 'Admin' || user?.role === 'HR') && (
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '16px' }}>
              <div style={{ padding: '13px 20px', borderBottom: '1px solid #f1f5f9', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#92400e' }}>Disciplinary Records</p><p style={{ margin: '2px 0 0', fontSize: '11px', color: '#b45309' }}>Written warnings and formal notices</p></div><button onClick={() => setShowWarnForm(p => !p)} style={{ padding: '5px 14px', borderRadius: '8px', border: 'none', background: showWarnForm ? '#f1f5f9' : '#d97706', color: showWarnForm ? '#64748b' : 'white', fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer' }}>{showWarnForm ? 'Cancel' : '+ Add Record'}</button></div>
              {showWarnForm && (<div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}><div><label>Warning Type</label><select value={warnForm.warning_type} onChange={e => setWarnForm(p => ({ ...p, warning_type: e.target.value }))} style={S.input}>{['Verbal Warning', 'Written Warning', 'Final Written Warning', 'Suspension', 'Dismissal'].map(t => <option key={t} value={t}>{t}</option>)}</select></div><div><label>Date Issued</label><DatePicker value={warnForm.issued_date} onChange={v => setWarnForm(p => ({ ...p, issued_date: v }))} /></div><div style={{ gridColumn: 'span 2' }}><label>Reason / Offence *</label><textarea value={warnForm.reason} onChange={e => setWarnForm(p => ({ ...p, reason: e.target.value }))} placeholder="Describe the reason for this disciplinary action..." rows={3} style={{ ...S.input, resize: 'vertical', lineHeight: '1.5' }} /></div><div style={{ gridColumn: 'span 2' }}><label>Additional Notes</label><textarea value={warnForm.notes} onChange={e => setWarnForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any further context, actions agreed, or follow-up details..." rows={2} style={{ ...S.input, resize: 'vertical', lineHeight: '1.5' }} /></div></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><button onClick={() => setShowWarnForm(false)} style={S.ghostBtn}>Cancel</button><button onClick={handleSaveWarning} disabled={savingWarn || !warnForm.reason.trim()} style={{ ...S.primaryBtn, background: 'linear-gradient(135deg,#d97706,#b45309)', boxShadow: '0 2px 6px rgba(217,119,6,0.25)', opacity: (savingWarn || !warnForm.reason.trim()) ? 0.6 : 1 }}>{savingWarn ? 'Saving...' : 'Save Record'}</button></div></div>)}
              {warningsLoading ? <p style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Loading...</p> : warnings.length === 0 ? <p style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>No disciplinary records on file.</p> : warnings.map((w, i) => { const typeColors = { 'Verbal Warning': { bg: '#fef9c3', color: '#ca8a04', border: '#fde68a' }, 'Written Warning': { bg: '#fffbeb', color: '#d97706', border: '#fde68a' }, 'Final Written Warning': { bg: '#fee2e2', color: '#dc2626', border: '#fecaca' }, 'Suspension': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }, 'Dismissal': { bg: '#fef2f2', color: '#7f1d1d', border: '#fca5a5' } }; const tc = typeColors[w.warning_type] || typeColors['Written Warning']; return (<div key={w.id} style={{ padding: '14px 20px', borderTop: i > 0 ? '1px solid #f8fafc' : 'none' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}><div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}><span style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>{w.warning_type}</span>{w.issued_date && <span style={{ color: '#64748b', fontSize: '12px' }}>{fmtDate(w.issued_date)}</span>}{w.issued_by_username && <span style={{ color: '#94a3b8', fontSize: '11px' }}>by @{w.issued_by_username}</span>}</div>{user?.role === 'Admin' && <button onClick={() => handleDeleteWarning(w.id)} disabled={deletingWarnId === w.id} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }} onMouseEnter={e => e.target.style.color = '#dc2626'} onMouseLeave={e => e.target.style.color = '#cbd5e1'}>{deletingWarnId === w.id ? '...' : '×'}</button>}</div><p style={{ margin: '8px 0 0', fontSize: '13px', color: '#334155', lineHeight: '1.6' }}>{w.reason}</p>{w.notes && <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', lineHeight: '1.5', background: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>{w.notes}</p>}</div>); })}
            </div>
          )}

          {(user?.role === 'Admin' || user?.role === 'HR') && (
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '16px' }}>
              <div style={{ padding: '13px 20px', borderBottom: '1px solid #f1f5f9' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Comments</p><p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>Internal notes visible to HR and Admin only</p></div>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}><textarea value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePostEmpNote(); }} placeholder="Add an internal note..." rows={3} style={{ ...S.input, width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: '10px 12px', lineHeight: '1.5' }} />{noteError && <p style={{ color: '#dc2626', fontSize: '12px', margin: '4px 0 0' }}>{noteError}</p>}<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}><span style={{ fontSize: '11px', color: '#94a3b8' }}>Ctrl+Enter to post quickly</span><button onClick={handlePostEmpNote} disabled={postingNote || !newNote.trim()} style={{ ...S.primaryBtn, padding: '7px 18px', opacity: (postingNote || !newNote.trim()) ? 0.5 : 1, cursor: (postingNote || !newNote.trim()) ? 'not-allowed' : 'pointer' }}>{postingNote ? 'Posting...' : 'Post Note'}</button></div></div>
              {empNotesLoading ? <p style={{ padding: '14px 20px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Loading...</p> : empNotes.length === 0 ? <p style={{ padding: '14px 20px', color: '#94a3b8', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>No notes yet. Add one above.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>{empNotes.map((n, i) => (<div key={n.id} style={{ padding: '12px 20px', borderTop: i > 0 ? '1px solid #f8fafc' : 'none' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e0e7ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{(n.username || '?')[0].toUpperCase()}</div><span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{n.username || 'Unknown'}</span><span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', border: '1px solid', background: n.role === 'Admin' ? '#e0e7ff' : '#f0fdf4', color: n.role === 'Admin' ? '#6366f1' : '#16a34a', borderColor: n.role === 'Admin' ? '#c7d2fe' : '#bbf7d0' }}>{n.role}</span>{n.franchise_name && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{n.franchise_name}</span>}</div><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(n.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date(n.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>{(user?.role === 'Admin' || n.username === user?.username) && <button onClick={() => handleDeleteEmpNote(n.id)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }} onMouseEnter={e => e.target.style.color = '#dc2626'} onMouseLeave={e => e.target.style.color = '#cbd5e1'}>×</button>}</div></div><p style={{ margin: 0, paddingLeft: '36px', fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{n.note}</p></div>))}</div>}
            </div>
          )}
          </>}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  const empWithBday = bdayEmployees.filter(e => e.birth_date);
  const bdayFirstDay = new Date(bdayYear, bdayMonth, 1);
  const bdayLastDay  = new Date(bdayYear, bdayMonth + 1, 0);
  const bdayOffset   = (bdayFirstDay.getDay() + 6) % 7;
  const bdayCells    = [...Array(bdayOffset).fill(null), ...Array.from({ length: bdayLastDay.getDate() }, (_, i) => i + 1)];
  const bdays = {};
  empWithBday.forEach(e => { const d = new Date(e.birth_date + 'T00:00:00'); if (d.getMonth() === bdayMonth) { const day = d.getDate(); if (!bdays[day]) bdays[day] = []; bdays[day].push(e); } });
  const thisMonthBdays = Object.entries(bdays).map(([day, emps]) => ({ day: parseInt(day), emps })).sort((a, b) => a.day - b.day);
  const CAL_MONTHS_BD = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const CAL_DAYS_BD   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={S.pageTitle}>Employees</h2>
          {user?.role === 'Admin' && <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>{[{ key: false, label: 'List' }, { key: true, label: 'Birthdays' }].map(opt => (<button key={String(opt.key)} onClick={() => setBdayView(opt.key)} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer', background: bdayView === opt.key ? 'white' : 'transparent', color: bdayView === opt.key ? '#0f172a' : '#94a3b8', boxShadow: bdayView === opt.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{opt.label}</button>))}</div>}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!bdayView && <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, email..." style={{ ...S.input, width: isMobile ? '100%' : '220px', margin: 0 }} />}
          {can(user, 'employees.view') && !bdayView && <button onClick={() => { const date = new Date().toISOString().split('T')[0]; downloadCsv(`employees-${date}.csv`, filtered, ['first_name','last_name','job_title','email','cell','franchise_name'], { first_name:'First Name', last_name:'Last Name', job_title:'Position', email:'Email', cell:'Cell', franchise_name:'Branch' }); }} style={S.ghostBtn}>Export CSV</button>}
          {(user?.role === 'Admin' || user?.role === 'HR') && !bdayView && <button onClick={() => { setView('add'); setError(''); setAddForm(EMPTY_ADD); }} style={S.primaryBtn}>+ Add Employee</button>}
        </div>
      </div>
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {/* Birthday Calendar */}
      {bdayView && user?.role === 'Admin' && (bdayLoading ? <Spinner size="lg" dark label="Loading birthdays..." /> : <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Employee Birthdays</h3><button onClick={fetchBirthdayEmployees} disabled={bdayLoading} title="Refresh birthday data" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '3px 10px', cursor: bdayLoading ? 'default' : 'pointer', color: '#64748b', fontSize: '12px', fontFamily: 'DM Sans', opacity: bdayLoading ? 0.5 : 1 }}>{bdayLoading ? '...' : 'Refresh'}</button></div><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><button onClick={() => { if (bdayMonth === 0) { setBdayMonth(11); setBdayYear(y => y - 1); } else setBdayMonth(m => m - 1); }} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '4px 11px', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontFamily: 'DM Sans' }}>&lsaquo;</button><span style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a', minWidth: '130px', textAlign: 'center' }}>{CAL_MONTHS_BD[bdayMonth]} {bdayYear}</span><button onClick={() => { if (bdayMonth === 11) { setBdayMonth(0); setBdayYear(y => y + 1); } else setBdayMonth(m => m + 1); }} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '4px 11px', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontFamily: 'DM Sans' }}>&rsaquo;</button></div></div>
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>{CAL_DAYS_BD.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0' }}>{d}</div>)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' }}>{bdayCells.map((day, i) => { const hasBday = day && bdays[day]; const today = new Date(); const isToday = day && day === today.getDate() && bdayMonth === today.getMonth() && bdayYear === today.getFullYear(); return (<div key={i} style={{ minHeight: '62px', borderRadius: '10px', padding: '5px', background: hasBday ? '#fdf2f8' : (day ? (isToday ? '#eff6ff' : '#fafafa') : 'transparent'), border: hasBday ? '1.5px solid #f9a8d4' : (day ? (isToday ? '1.5px solid #bfdbfe' : '1px solid #f1f5f9') : 'none') }}>{day && <><div style={{ fontSize: '10px', fontWeight: isToday ? '700' : '500', color: isToday ? '#2563eb' : '#94a3b8', textAlign: 'right', lineHeight: 1, marginBottom: '4px' }}>{day}</div>{hasBday && bdays[day].map(e => (<div key={e.id} style={{ background: '#f9a8d4', color: '#831843', borderRadius: '5px', fontSize: '9px', fontWeight: '700', padding: '3px 5px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>{e.first_name} {e.last_name?.charAt(0)}.</div>))}</>}</div>); })}</div>
        </div>
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '14px 22px' }}><p style={{ margin: '0 0 10px', fontFamily: 'Sora', fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{thisMonthBdays.length === 0 ? 'No birthdays this month' : `Birthdays in ${CAL_MONTHS_BD[bdayMonth]} (${thisMonthBdays.length})`}</p><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{thisMonthBdays.map(({ day, emps }) => emps.map(e => { const age = bdayYear - new Date(e.birth_date + 'T00:00:00').getFullYear(); return (<div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: '#fdf2f8', border: '1px solid #fbcfe8' }}><div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#db2777', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>{e.first_name?.charAt(0)}{e.last_name?.charAt(0)}</div><div style={{ flex: 1 }}><p style={{ margin: 0, fontWeight: '600', fontSize: '13.5px', color: '#0f172a' }}>{e.first_name} {e.last_name}</p><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{e.job_title || 'Employee'} &middot; {e.franchise_name || ''}</p></div><div style={{ textAlign: 'right' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '18px', fontWeight: '700', color: '#db2777' }}>{CAL_MONTHS_BD[bdayMonth].slice(0, 3)} {day}</p><p style={{ margin: 0, fontSize: '11px', color: '#be185d' }}>Turns {age}</p></div></div>); }))}</div></div>
      </div>)}

      {!bdayView && <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? <Spinner size="lg" dark label="Loading employees..." /> : filtered.length === 0 ? <EmptyState icon="blank" title="No employees yet" subtitle="Add your first employee to get started." action="+ Add Employee" onAction={() => { setView('add'); setAddForm(EMPTY_ADD); }} /> : isMobile ? (<div>{filtered.reduce((rows, emp, i) => { const prev = filtered[i - 1]; const dept = emp.job_title || 'No Position'; const prevDept = prev?.job_title || 'No Position'; if (i === 0 || dept !== prevDept) { rows.push(<div key={`dept-${dept}`} style={{ padding: '6px 18px 5px', background: '#f8fafc', borderTop: i === 0 ? 'none' : '2px solid #e4e8f0', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dept}</div>); } rows.push(<div key={emp.id} onClick={() => { if (user?.role === 'Admin' || emp?.user_id === user?.id) openDetail(emp); }} style={{ padding: '14px 18px', borderTop: '1px solid #f1f5f9', cursor: (user?.role === 'Admin' || emp?.user_id === user?.id) ? 'pointer' : 'default', opacity: (user?.role === 'Admin' || emp?.user_id === user?.id) ? 1 : 0.75 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}><span style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{emp.first_name} {emp.last_name}</span><span style={{ color: '#6366f1', fontSize: '12px', fontWeight: '600' }}>View</span></div><p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{emp.franchise_name || 'No branch'}</p></div>); return rows; }, [])}</div>) : (<><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}><thead><tr style={{ background: '#f8fafc' }}>{['Name', ...(user?.role === 'Admin' ? ['ID Number'] : []), 'Position', 'Cell', 'Franchise', 'Actions'].map(h => <th key={h} style={{ padding: '10px 22px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>)}</tr></thead><tbody>{filtered.reduce((rows, emp, i) => { const prev = filtered[i - 1]; const dept = emp.job_title || 'No Position'; const prevDept = prev?.job_title || 'No Position'; if (i === 0 || dept !== prevDept) { rows.push(<tr key={`dept-${dept}`}><td colSpan={user?.role === 'Admin' ? 6 : 5} style={{ padding: '8px 22px 6px', background: '#f8fafc', borderTop: i === 0 ? 'none' : '2px solid #e4e8f0', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dept}</td></tr>); } rows.push(<tr key={emp.id} className="table-row" style={{ borderTop: '1px solid #f1f5f9' }}><td style={{ padding: '12px 22px', fontWeight: '500', color: '#0f172a' }}>{emp.first_name} {emp.last_name}</td>{user?.role === 'Admin' && <td style={{ padding: '12px 22px', color: '#64748b' }}>{emp.id_number || '—'}</td>}<td style={{ padding: '12px 22px', color: '#64748b' }}>{emp.job_title || '—'}</td><td style={{ padding: '12px 22px', color: '#64748b' }}>{emp.cell || emp.home_phone || '—'}</td><td style={{ padding: '12px 22px' }}>{emp.franchise_name ? <span style={{ background: '#e0e7ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>{emp.franchise_name}</span> : '—'}</td><td style={{ padding: '12px 22px' }}><div style={{ display: 'flex', gap: '8px' }}>{(user?.role === 'Admin' || emp?.user_id === user?.id) && <button onClick={() => openDetail(emp)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>View</button>}{(user?.role === 'Admin' || emp?.user_id === user?.id) && <button onClick={() => openEdit(emp)} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>Edit</button>}</div></td></tr>); return rows; }, [])}</tbody></table>{pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onPageChange={handlePageChange} />}</>)}
      </div>}

      {/* Past Employees */}
      {can(user, 'employees.view') && (<div style={{ marginTop: '32px' }}><button onClick={() => setShowPast(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#64748b', padding: '0 0 12px' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', background: '#f1f5f9', fontSize: '10px', transition: 'transform 0.15s', transform: showPast ? 'rotate(90deg)' : 'none' }}>{'>'}</span>Past Employees{pastEmployees.length > 0 && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '10px', fontSize: '11px', fontWeight: '600', padding: '1px 8px' }}>{pastEmployees.length}</span>}</button>{showPast && (<div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #f1f5f9' }}>{pastLoading ? <p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Loading...</p> : pastEmployees.length === 0 ? <p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>No past employees on record.</p> : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}><thead><tr style={{ background: '#f8fafc' }}>{['Name', 'Position', 'Franchise', 'Type', 'Date', 'Reason'].map(h => <th key={h} style={{ padding: '10px 22px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>)}</tr></thead><tbody>{pastEmployees.map((emp, i) => (<tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9', opacity: 0.75 }}><td style={{ padding: '12px 22px', fontWeight: '500', color: '#0f172a' }}>{emp.first_name} {emp.last_name}</td><td style={{ padding: '12px 22px', color: '#64748b' }}>{emp.job_title || '—'}</td><td style={{ padding: '12px 22px', color: '#64748b' }}>{emp.franchise_name || '—'}</td><td style={{ padding: '12px 22px' }}>{emp.termination_type ? <span style={{ background: emp.termination_type === 'Resignation' ? '#fffbeb' : '#fef2f2', color: emp.termination_type === 'Resignation' ? '#d97706' : '#dc2626', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>{emp.termination_type}</span> : '—'}</td><td style={{ padding: '12px 22px', color: '#94a3b8', fontSize: '12px' }}>{fmtDate(emp.terminated_at)}</td><td style={{ padding: '12px 22px', color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={emp.termination_reason}>{emp.termination_reason || '—'}</td></tr>))}</tbody></table>}</div>)}</div>)}
    </div>
  );
}

// ── Helpers ──
function FormSection({ title, children }) { return (<div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}><div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{title}</p></div><div style={{ padding: '18px 20px' }}>{children}</div></div>); }
function FormField({ label, children, span }) { return (<div style={{ gridColumn: span ? `span ${span}` : 'span 1' }}><label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px', fontWeight: '500' }}>{label}</label>{children}</div>); }
function DetailSection({ title, data }) { return (<div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}><div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '12px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</p></div><div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 24px' }}>{data.filter(d => d.value && d.value !== '—').map(d => (<div key={d.label}><span style={{ color: '#94a3b8', fontSize: '11px' }}>{d.label}</span><p style={{ color: '#0f172a', fontSize: '13.5px', margin: '2px 0 0', fontWeight: '500' }}>{d.value || '—'}</p></div>))}{data.filter(d => !d.value || d.value === '—').length > 0 && <div style={{ gridColumn: 'span 2', color: '#94a3b8', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>No data available</div>}</div></div>); }

// ── DatePicker ──
const DP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DP_WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const dpNavBtn = { background: '#f1f5f9', border: 'none', borderRadius: '6px', width: '26px', height: '26px', cursor: 'pointer', color: '#64748b', fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const dpSelStyle = { border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 4px', fontSize: '12px', fontFamily: 'DM Sans', color: '#0f172a', cursor: 'pointer', background: 'white' };

function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false); const [pos, setPos] = useState({ top: 0, left: 0 }); const ref = useRef(null); const triggerRef = useRef(null);
  const valid = value && /^\d{4}-\d{2}-\d{2}$/.test(value); const base = valid ? new Date(value + 'T00:00:00') : new Date();
  const [year, setYear] = useState(base.getFullYear()); const [month, setMonth] = useState(base.getMonth());
  const toggleOpen = () => { if (!open && triggerRef.current) { const r = triggerRef.current.getBoundingClientRect(); const POPUP_W = 252, POPUP_H = 320; const spaceBelow = window.innerHeight - r.bottom; const top = (spaceBelow < POPUP_H && r.top > POPUP_H) ? r.top - POPUP_H - 4 : r.bottom + 4; let left = r.left; if (left + POPUP_W > window.innerWidth - 8) left = window.innerWidth - POPUP_W - 8; if (left < 8) left = 8; setPos({ top, left }); } setOpen(o => !o); };
  useEffect(() => { if (open && valid) { const d = new Date(value + 'T00:00:00'); setYear(d.getFullYear()); setMonth(d.getMonth()); } }, [open]);
  useEffect(() => { if (!open) return; const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler); }, [open]);
  const pick = (day) => { onChange(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`); setOpen(false); };
  const shift = (delta) => { let m = month + delta, y = year; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); };
  const daysInMonth = new Date(year, month + 1, 0).getDate(); const offset = (new Date(year, month, 1).getDay() + 6) % 7; const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const display = valid ? value.replace(/-/g, '/') : ''; const thisYear = new Date().getFullYear();
  return (<div ref={ref} style={{ position: 'relative' }}><div ref={triggerRef} onClick={toggleOpen} style={{ ...S.input, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ color: display ? '#0f172a' : '#94a3b8' }}>{display || 'YYYY/MM/DD'}</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></div>{open && (<div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, background: 'white', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0', padding: '12px', width: '252px' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}><button type="button" onClick={() => shift(-1)} style={dpNavBtn}>&lsaquo;</button><div style={{ display: 'flex', gap: '6px' }}><select value={month} onChange={e => setMonth(Number(e.target.value))} style={dpSelStyle}>{DP_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select><select value={year} onChange={e => setYear(Number(e.target.value))} style={dpSelStyle}>{Array.from({ length: 100 }, (_, i) => thisYear - 85 + i).map(y => <option key={y} value={y}>{y}</option>)}</select></div><button type="button" onClick={() => shift(1)} style={dpNavBtn}>&rsaquo;</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>{DP_WEEKDAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#94a3b8', padding: '2px 0' }}>{d}</div>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>{cells.map((day, i) => { if (day === null) return <div key={`e${i}`} />; const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const isSel = valid && iso === value; return <button type="button" key={day} onClick={() => pick(day)} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#eef2ff'; }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }} style={{ border: 'none', borderRadius: '6px', padding: '6px 0', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', background: isSel ? '#6366f1' : 'transparent', color: isSel ? 'white' : '#0f172a', fontWeight: isSel ? '700' : '500' }}>{day}</button>; })}</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}><button type="button" onClick={() => { onChange(''); setOpen(false); }} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans' }}>Clear</button><button type="button" onClick={() => { const t = new Date(); onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`); setOpen(false); }} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans' }}>Today</button></div></div>)}</div>);
}