import Modal from './ui/Modal';
import { documentPreviewUrl, documentDownloadUrl } from '../lib/documents';

// Generic inline preview for any uploaded EventDocument — PDF and image
// content types render directly; anything else falls back to a download
// link, since there's nothing meaningful to embed for e.g. a .docx.
export default function DocumentPreviewModal({ document, onClose }) {
  if (!document) return null;
  const isPdf = document.contentType === 'application/pdf';
  const isImage = document.contentType?.startsWith('image/');

  return (
    <Modal open={!!document} onClose={onClose} title={document.filename} widthClass="max-w-3xl" bodyClassName="p-0">
      {isPdf ? (
        <iframe title={document.filename} src={documentPreviewUrl(document.id)} className="w-full h-[75vh] border-0" />
      ) : isImage ? (
        <div className="flex items-center justify-center bg-slate-50 p-4 max-h-[75vh] overflow-auto">
          <img src={documentPreviewUrl(document.id)} alt={document.filename} className="max-w-full h-auto" />
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-slate-500">
          <p>This file type can't be previewed here.</p>
        </div>
      )}
      <div className="px-4 py-2.5 border-t border-slate-100 text-right">
        <a href={documentDownloadUrl(document.id)} target="_blank" rel="noreferrer" data-testid="document-preview-download-link" className="text-xs text-indigo-600 font-semibold hover:underline">
          Download {document.filename}
        </a>
      </div>
    </Modal>
  );
}
