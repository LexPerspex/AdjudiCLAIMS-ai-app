import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { useClaimDocuments, useUploadDocument } from '~/hooks/api/use-documents';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ocrStatusConfig(status: string) {
  switch (status) {
    case 'COMPLETE':
      return {
        label: 'OCR Complete',
        icon: CheckCircle,
        className: 'bg-secondary-fixed-dim text-on-secondary-fixed-variant',
      };
    case 'PROCESSING':
      return { label: 'Processing', icon: Clock, className: 'bg-tertiary-fixed text-tertiary' };
    case 'PENDING':
      return {
        label: 'Pending',
        icon: Clock,
        className: 'bg-surface-container text-on-surface-variant',
      };
    case 'FAILED':
      return {
        label: 'OCR Failed',
        icon: XCircle,
        className: 'bg-error-container text-on-error-container',
      };
    default:
      return {
        label: status,
        icon: FileText,
        className: 'bg-surface-container text-on-surface-variant',
      };
  }
}

function documentTypeColor(docType: string): string {
  const type = docType.toLowerCase();
  if (type.includes('medical') || type.includes('report')) return 'bg-primary-fixed text-primary';
  if (type.includes('legal')) return 'bg-error-container text-on-error-container';
  if (type.includes('photo') || type.includes('image')) return 'bg-tertiary-fixed text-tertiary';
  return 'bg-surface-container-high text-on-surface-variant';
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Documents Tab                                                      */
/* ------------------------------------------------------------------ */

export default function ClaimDocumentsTab() {
  const { claimId } = useParams<{ claimId: string }>();
  const docsQuery = useClaimDocuments(claimId ?? '');
  const uploadMutation = useUploadDocument(claimId ?? '');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents = docsQuery.data ?? [];

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => uploadFile(file));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => uploadFile(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('claimId', claimId ?? '');
    uploadMutation.mutate(formData);
  }

  if (docsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-400">Loading documents...</p>
      </div>
    );
  }

  if (docsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-sm text-error">Failed to load documents.</p>
        <button
          onClick={() => void docsQuery.refetch()}
          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-outline-variant/30 bg-surface-container-low hover:border-primary/50 hover:bg-surface-container',
        )}
      >
        <Upload className={cn('w-8 h-8', isDragging ? 'text-primary' : 'text-slate-400')} />
        <div className="text-center">
          <p className="text-sm font-bold text-on-surface">
            {isDragging ? 'Drop to upload' : 'Drag & drop files here'}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            or click to browse — PDF, images, Word documents
          </p>
        </div>
        {uploadMutation.isPending && (
          <p className="text-xs text-primary font-bold animate-pulse">Uploading...</p>
        )}
        {uploadMutation.isError && (
          <p className="text-xs text-error font-bold">Upload failed. Try again.</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.tiff"
          onChange={handleFileChange}
        />
      </div>

      {/* Documents Table */}
      <section className="bg-surface-container-lowest rounded-2xl ambient-shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">
            Documents
            {documents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-on-surface-variant">
                ({documents.length})
              </span>
            )}
          </h3>
        </div>

        {documents.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <FileText className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-on-surface-variant">No documents uploaded yet.</p>
            <p className="text-xs text-slate-400">Upload files using the zone above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Document
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Type
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Uploaded
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Size
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    OCR Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {documents.map((doc) => {
                  const ocr = ocrStatusConfig(doc.ocrStatus);
                  const OcrIcon = ocr.icon;
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-on-surface truncate max-w-xs">
                            {doc.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            documentTypeColor(doc.documentType),
                          )}
                        >
                          {doc.documentType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">
                        {formatBytes(doc.fileSize)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            ocr.className,
                          )}
                        >
                          <OcrIcon className="w-3 h-3" />
                          {ocr.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
