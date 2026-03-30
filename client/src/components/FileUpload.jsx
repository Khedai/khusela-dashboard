import { useState, useRef } from 'react';
import api from '../utils/api';

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx';

export default function FileUpload({
  uploadUrl, // e.g. '/documents/leave/uuid'
  extraFields = {}, // e.g. { doc_type: 'Sick Note', folder_category: 'Medical' }
  onUploadComplete, // callback after successful upload
  label = 'Upload Document',
  compact = false, // smaller inline style
  onUploadStart,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    onUploadStart?.(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));

      const res = await api.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploadComplete?.(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (compact) {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '6px 14px',
            borderRadius: '7px',
            border: '1px solid #e2e8f0',
            background: 'white',
            color: '#475569',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: 'DM Sans',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            opacity: uploading ? 0.8 : 1,
          }}
        >
          {uploading ? 'Uploading...' : label}
        </button>
        {error && <p style={{ color: '#dc2626', fontSize: '11px', margin: '4px 0 0' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])}
      />
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? '#2563eb' : '#e2e8f0'}`,
          borderRadius: '10px',
          padding: '24px',
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          background: dragOver ? '#eff6ff' : '#fafafa',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>
          {uploading ? 'Uploading...' : 'Upload'}
        </div>
        <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
          {uploading ? 'Uploading...' : label}
        </p>
        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>JPG, PNG, PDF, DOC, DOCX, XLS, XLSX — max 20MB</p>
        {!uploading && (
          <button
            type="button"
            style={{
              marginTop: '12px',
              padding: '7px 18px',
              borderRadius: '7px',
              border: 'none',
              background: '#0f172a',
              color: 'white',
              fontSize: '12px',
              fontWeight: '600',
              fontFamily: 'DM Sans',
              cursor: 'pointer',
            }}
          >
            Browse Files
          </button>
        )}
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
