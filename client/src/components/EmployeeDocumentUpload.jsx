import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import * as S from '../utils/styles';

const DOC_TYPES = [
  { value: 'id_copy', label: 'ID Copy' },
  { value: 'employment_contract', label: 'Employment Contract' },
  { value: 'bank_statement', label: 'Bank Statement / Details' },
  { value: 'other', label: 'Other' },
];

export default function EmployeeDocumentUpload({ employeeId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('id_copy');
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef();

  useEffect(() => { fetchDocuments(); }, [employeeId]);

  const fetchDocuments = async () => {
    try {
      const res = await api.get(`/employee-documents/${employeeId}`);
      setDocuments(res.data);
    } catch { setError('Failed to load documents.'); }
    finally { setLoading(false); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) { setError('Only JPG, PNG and PDF files are allowed.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB.'); return; }
    setError('');
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) { setError('Please select a file.'); return; }
    setUploading(true); setError(''); setSuccess('');
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('doc_type', docType);
    formData.append('employee_id', employeeId);
    try {
      await api.post('/employee-documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Document uploaded successfully.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally { setUploading(false); }
  };

  const handleDownload = async (docId) => {
    try {
      const res = await api.get(`/employee-documents/download/${docId}`);
      window.open(res.data.url, '_blank');
    } catch { setError('Failed to generate download link.'); }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.delete(`/employee-documents/${docId}`);
      setSuccess('Deleted.');
      fetchDocuments();
    } catch { setError('Failed to delete.'); }
  };

  const docTypeLabel = (type) => DOC_TYPES.find(d => d.value === type)?.label || type;
  const fileIcon = (name) => {
    if (!name) return 'FILE';
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (['jpg','jpeg','png'].includes(ext)) return 'IMG';
    return 'FILE';
  };
  const iconColors = {
    PDF: { bg: '#fef2f2', color: '#dc2626' },
    IMG: { bg: '#eff6ff', color: '#2563eb' },
    FILE: { bg: '#f8fafc', color: '#64748b' },
  };

  return (
    <div>
      <p style={S.formSectionTitle}>Employee Documents</p>

      {error && <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}
      {success && <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '14px' }}>{success}</div>}

      <div style={{ border: '2px dashed #e2e8f0', borderRadius: '10px', padding: '18px', marginBottom: '18px', background: selectedFile ? '#f0fdf4' : '#f8fafc', borderColor: selectedFile ? '#86efac' : '#e2e8f0' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} style={S.input}>
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>File (JPG, PNG or PDF — max 10MB)</label>
            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileChange}
              style={{ ...S.input, padding: '8px 12px', cursor: 'pointer' }} />
          </div>
          <button onClick={handleUpload} disabled={uploading || !selectedFile}
            style={{ ...S.primaryBtn, opacity: (uploading || !selectedFile) ? 0.5 : 1, cursor: (uploading || !selectedFile) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', height: '40px' }}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {selectedFile && <div style={{ marginTop: '10px', fontSize: '12px', color: '#16a34a', fontWeight: '500' }}>Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</div>}
      </div>

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading...</p>
      ) : documents.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', border: '1px solid #f1f5f9', borderRadius: '10px', color: '#94a3b8', fontSize: '13px' }}>
          No documents uploaded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {documents.map(doc => {
            const icon = fileIcon(doc.file_name);
            const iconStyle = iconColors[icon];
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 13px', borderRadius: '10px', border: '1px solid #f1f5f9', background: 'white' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '7px', background: iconStyle.bg, color: iconStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{docTypeLabel(doc.doc_type)} · {new Date(doc.uploaded_at).toLocaleDateString('en-ZA')}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                  <button onClick={() => handleDownload(doc.id)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>Download</button>
                  <button onClick={() => handleDelete(doc.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
