import { AlertCircle, Check, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { validateImageFile } from '../../lib/imageFile';
import { supabase } from '../../lib/supabase';
import { ACCEPT_IMAGE_INPUT, MAIN_MAX_DIMENSION, MAX_COMPRESSED_MAIN_MB, MAX_SOURCE_IMAGE_MB } from '../../lib/uploadLimits';

export function ResolveForm({ groupId, onCancel, onSuccess, headingId = 'resolve-heading' }) {
  const [proofFile, setProofFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const headingRef = useRef(null);
  const fileInputRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const setPreview = (file) => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validation = await validateImageFile(file);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setError(null);
    setProofFile(file);
    setPreview(file);
  }, []);

  const handleClose = () => {
    if (uploading) return;
    setProofFile(null);
    setPreview(null);
    setNote('');
    setError(null);
    onCancel();
  };

  const handleSubmit = useCallback(async () => {
    if (!proofFile || !groupId || submittingRef.current) return;

    submittingRef.current = true;
    setUploading(true);
    setError(null);

    try {
      const compressedFile = await imageCompression(proofFile, {
        maxWidthOrHeight: MAIN_MAX_DIMENSION,
        maxSizeMB: MAX_COMPRESSED_MAIN_MB,
        initialQuality: 0.82,
        useWebWorker: false,
        fileType: 'image/jpeg',
        exifOrientation: true,
      });

      const fileName = `${groupId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('proof-images').upload(fileName, compressedFile, {
        contentType: 'image/jpeg',
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('proof-images').getPublicUrl(fileName);
      const proofUrl = publicData?.publicUrl;
      if (!proofUrl) throw new Error('Could not create a URL for the resolution photo.');

      const { error: rpcError } = await supabase.rpc('admin_update_status', {
        p_group_id: groupId,
        p_new_status: 'resolved',
        p_note: note.trim() || null,
        p_proof_url: proofUrl,
      });

      if (rpcError) throw rpcError;

      onSuccess();
    } catch (err) {
      console.error('Resolve failed:', err);
      setError(err.message || 'Could not submit resolution proof. Please try again.');
    } finally {
      submittingRef.current = false;
      setUploading(false);
    }
  }, [groupId, note, onSuccess, proofFile]);

  return (
    <section
      className="relative z-20 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
      aria-labelledby={headingId}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-bold text-slate-900 outline-none">
          Submit resolution proof
        </h2>
        <button
          type="button"
          onClick={handleClose}
          disabled={uploading}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          aria-label="Cancel resolution"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Resolution photo <span className="text-rose-600">*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_IMAGE_INPUT}
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
            id="proof-upload"
          />
          <label
            htmlFor="proof-upload"
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition ${
              previewUrl ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            } ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="Resolution photo preview" className="h-32 w-auto rounded-lg object-cover" />
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check size={14} />
                  Photo selected
                </span>
              </>
            ) : (
              <>
                <ImageIcon size={28} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-600">Choose resolution photo</span>
                <span className="text-[10px] text-slate-400">JPG, PNG or WebP (up to {MAX_SOURCE_IMAGE_MB} MB)</span>
              </>
            )}
          </label>
        </div>

        <div>
          <label htmlFor="resolve-note" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Resolution note (optional)
          </label>
          <textarea
            id="resolve-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={uploading}
            maxLength={500}
            rows={3}
            placeholder="Describe what was repaired…"
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:opacity-50"
          />
          <p className="mt-1 text-right text-[10px] text-slate-400">{note.length}/500</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-rose-700">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-xs">{error}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={uploading}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!proofFile || uploading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Submitting resolution proof…</span>
            </>
          ) : (
            <>
              <Check size={14} />
              <span>Submit resolution proof</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}

export function ResolveModal(props) {
  return <ResolveForm {...props} onCancel={props.onClose} />;
}
