const FILE_ICONS = {
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOC',
  xls: 'XLS',
  xlsx: 'XLS',
  jpg: 'IMG',
  jpeg: 'IMG',
  png: 'IMG',
  gif: 'IMG',
  webp: 'IMG',
};

export const getIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || 'FILE';
};

export const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

