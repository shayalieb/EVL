// An inline PDF with a way out. Some browsers (many phones, some locked-down desktops) cannot show a PDF
// inside a page and would leave a blank box, so those get a plain explanation instead, and everyone gets
// "Open in new tab" and "Download" under the document.
export default function PdfPreview({ url, title, filename = 'document.pdf', frameTestId, frameClassName = 'h-[calc(100dvh-8.5rem)] w-full border-0 sm:h-[70vh]' }) {
  const inlineSupported = typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false;
  if (!url) return null;
  return (
    <>
      {inlineSupported ? (
        <iframe title={title} src={url} data-testid={frameTestId} className={frameClassName} />
      ) : (
        <div className="p-8 text-center text-sm text-slate-600" data-testid="pdf-preview-unsupported">
          This browser can't show a PDF inside the page. Use “Open in new tab” or “Download” below to view it.
        </div>
      )}
      <div className="sticky bottom-0 flex justify-end gap-4 border-t border-slate-100 bg-white px-4 py-2.5 text-xs font-semibold">
        <a href={url} target="_blank" rel="noreferrer" data-testid="pdf-preview-open-link" className="text-indigo-600 hover:underline">Open in new tab</a>
        <a href={url} download={filename} data-testid="pdf-preview-download-link" className="text-indigo-600 hover:underline">Download</a>
      </div>
    </>
  );
}
