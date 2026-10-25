import { Camera, MapPin, Send, Sparkles, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import TextMessage from '../components/chat/TextMessage';
import ImageMessage from '../components/chat/ImageMessage';
import ChipsRow from '../components/chat/ChipsRow';
import MapCard from '../components/chat/MapCard';
import SuggestionCard from '../components/chat/SuggestionCard';
import ConfirmationCard from '../components/chat/ConfirmationCard';
import ErrorMessage from '../components/chat/ErrorMessage';
import { useChatFlow } from '../hooks/useChatFlow';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((value) => (
          <span
            key={value}
            className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400"
            style={{ animationDelay: `${value * 120}ms` }}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-slate-500">CivicBot is working...</span>
    </div>
  );
}

function ChatPage() {
  const {
    messages,
    chips,
    error,
    typing,
    canSend,
    input,
    setInput,
    handlePhotoSelect,
    handleChipSelect,
    handleUserText,
    retry,
    isBusy,
    uploadProgress,
  } = useChatFlow();
  const scrollRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [photoPreview, setPhotoPreview] = useState('');

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const onImageChange = (event, source) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (typeof URL !== 'undefined') {
      setPhotoPreview(URL.createObjectURL(file));
    }

    handlePhotoSelect(file);
    event.target.value = '';
  };

  const onSend = () => {
    if (!input.trim() || isBusy) {
      return;
    }

    handleUserText(input);
    setInput('');
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background px-0 py-0 sm:px-4">
      <div className="flex h-[calc(100vh-73px)] w-full max-w-5xl flex-col bg-white shadow-sm ring-1 ring-slate-200 sm:mt-4 sm:h-[calc(100vh-90px)] sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">CivicBot</p>
              <p className="text-xs text-slate-500">Local issue reporting</p>
            </div>
          </div>

          {photoPreview && (
            <button
              type="button"
              onClick={() => setPhotoPreview('')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            >
              <X size={14} />
              Clear preview
            </button>
          )}
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-5">
            {messages.map((message) => {
              if (message.role === 'bot') {
                return (
                  <div key={message.id} className="flex items-end gap-2 message-enter">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                      <MapPin size={14} />
                    </div>

                    <div className="max-w-[88%]">
                      {message.type === 'text' && <TextMessage text={message.text} isBot />}
                      {message.type === 'image' && (
                        <ImageMessage src={message.imageUrl} alt={message.alt} progress={message.progress || 100} caption="Uploaded photo" />
                      )}
                      {message.type === 'map' && (
                        <MapCard
                          address={message.address}
                          latitude={message.latitude}
                          longitude={message.longitude}
                          manualMode={message.manualMode}
                          onConfirm={message.onConfirm}
                          onAdjust={message.onAdjust}
                        />
                      )}
                      {message.type === 'suggestion' && (
                        <SuggestionCard
                          category={message.category}
                          severity={message.severity}
                          description={message.description}
                          confidence={message.confidence}
                        />
                      )}
                      {message.type === 'confirmation' && (
                        <ConfirmationCard
                          reportCode={message.reportCode}
                          category={message.category}
                          severity={message.severity}
                          address={message.address}
                          department={message.department}
                          status={message.status}
                          reportId={message.reportId}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex justify-end message-enter">
                  {message.type === 'text' && <TextMessage text={message.text} isBot={false} />}
                </div>
              );
            })}

            {typing && (
              <div className="flex items-end gap-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                  <MapPin size={14} />
                </div>
                <TypingIndicator />
              </div>
            )}

            {uploadProgress && (
              <div className="flex justify-start pl-10">
                <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
                    <span>{uploadProgress.label}</span>
                    <span>{uploadProgress.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress.value}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <ErrorMessage text={error} onRetry={retry} />
              </div>
            )}

            {chips.length > 0 && (
              <div className="flex justify-start pl-10">
                <ChipsRow chips={chips} onSelect={handleChipSelect} />
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <div className="flex gap-2">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => onImageChange(event, 'camera')}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => onImageChange(event, 'gallery')}
                />

                <button
                  type="button"
                  aria-label="Use camera"
                  onClick={openCamera}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <Camera size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Choose from gallery"
                  onClick={openGallery}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <ImageIcon size={18} />
                </button>
              </div>

              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={isBusy ? 'CivicBot is working...' : 'Describe the issue or send a photo'}
                  rows={1}
                  disabled={isBusy}
                  className="max-h-28 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-[#0b5f5b] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ChatPage;
