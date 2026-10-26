import { Camera, Image as ImageIcon, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ChipsRow from '../components/chat/ChipsRow';
import ConfirmationCard from '../components/chat/ConfirmationCard';
import ErrorMessage from '../components/chat/ErrorMessage';
import ImageMessage from '../components/chat/ImageMessage';
import MapCard from '../components/chat/MapCard';
import TextMessage from '../components/chat/TextMessage';
import { useChatFlow } from '../hooks/useChatFlow';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-xs border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-[0_2px_6px_-1px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((value) => (
          <span
            key={value}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600"
            style={{ animationDelay: `${value * 140}ms` }}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-slate-500">CivicBot is analyzing...</span>
    </div>
  );
}

function ChatPage() {
  const {
    status,
    messages,
    interaction,
    error,
    busy,
    typing,
    input,
    setInput,
    canSend,
    handlePhotoSelect,
    handleLocationConfirm,
    handleChipSelect,
    handleUserText,
    retry,
    reset,
  } = useChatFlow();

  const scrollRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing, interaction, error]);

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const onImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handlePhotoSelect(file);
    event.target.value = '';
  };

  const onSend = () => {
    if (!input.trim() || busy) return;
    handleUserText(input);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const handleNewReport = () => {
    if (status !== 'IDLE' && status !== 'DONE') {
      const confirmed = window.confirm('Start a new report? This will cancel the current report in progress.');
      if (!confirmed) return;
    }
    reset();
  };

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-slate-100/70 px-0 py-0 sm:px-4 sm:py-3">
      <div className="flex h-[calc(100vh-73px)] w-full max-w-4xl flex-col bg-white shadow-sm ring-1 ring-slate-200/80 sm:h-[calc(100vh-95px)] sm:rounded-3xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-600/20 shadow-xs">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-900">CivicBot</h1>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Assistant
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">Municipal Public Grievance Dispatcher</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewReport}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
              aria-label="Start a new report"
            >
              <RotateCcw size={12} className="text-slate-500" />
              <span>New report</span>
            </button>
          </div>
        </header>

        {/* Message Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-3.5 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-5">
            {messages.map((message) => {
              if (message.role === 'bot') {
                return (
                  <div key={message.id} className="flex items-start gap-2.5 message-enter pt-1">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs mt-0.5">
                      <Sparkles size={13} className="text-teal-100" />
                    </div>

                    <div className="max-w-[88%] sm:max-w-[82%]">
                      {message.type === 'text' && <TextMessage text={message.text} isBot />}
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
                <div key={message.id} className="flex justify-end message-enter py-0.5">
                  {message.type === 'text' && <TextMessage text={message.text} isBot={false} />}
                  {message.type === 'image' && (
                    <ImageMessage
                      src={message.imageUrl}
                      alt="Uploaded issue photo"
                      uploadStatus={message.uploadStatus}
                      onRetry={retry}
                    />
                  )}
                </div>
              );
            })}

            {/* Interaction Slot: Renders strictly below messages */}
            {interaction?.kind === 'location' && (
              <div className="flex items-start gap-2.5 message-enter pt-1">
                <div className="flex h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs mt-0.5">
                  <Sparkles size={13} className="text-teal-100" />
                </div>
                <div className="max-w-[90%] sm:max-w-[85%]">
                  <MapCard
                    latitude={interaction.latitude}
                    longitude={interaction.longitude}
                    address={interaction.address}
                    ward={interaction.ward}
                    source={interaction.source}
                    accuracy={interaction.accuracy}
                    manualMode={interaction.manualMode}
                    isSaving={busy}
                    onConfirm={handleLocationConfirm}
                  />
                </div>
              </div>
            )}

            {interaction?.kind === 'chips' && (
              <div className="flex justify-start pl-9 sm:pl-10 message-enter">
                <ChipsRow
                  options={interaction.options}
                  onSelect={handleChipSelect}
                  disabled={busy}
                />
              </div>
            )}

            {typing && (
              <div className="flex items-start gap-2.5 pt-1">
                <div className="flex h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs mt-0.5">
                  <Sparkles size={13} className="text-teal-100" />
                </div>
                <TypingIndicator />
              </div>
            )}

            {error && (
              <div className="flex justify-start pl-9 sm:pl-10">
                <ErrorMessage text={error.text} onRetry={retry} />
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* Input Controls Bar */}
          <div className="border-t border-slate-200/80 bg-white p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <div className="flex gap-1.5">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  className="hidden"
                  onChange={onImageChange}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="hidden"
                  onChange={onImageChange}
                />

                <button
                  type="button"
                  title="Take a photo"
                  aria-label="Use camera"
                  onClick={openCamera}
                  disabled={busy || status === 'DONE'}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 text-slate-600 transition hover:border-teal-500/30 hover:bg-teal-50/50 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Camera size={18} />
                </button>
                <button
                  type="button"
                  title="Upload from gallery"
                  aria-label="Choose from gallery"
                  onClick={openGallery}
                  disabled={busy || status === 'DONE'}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 text-slate-600 transition hover:border-teal-500/30 hover:bg-teal-50/50 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ImageIcon size={18} />
                </button>
              </div>

              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 shadow-2xs transition focus-within:border-teal-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-600/15">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={
                    busy
                      ? 'CivicBot is working...'
                      : status === 'AWAIT_NOTE'
                        ? 'Add landmark details or notes...'
                        : status === 'AWAIT_DESCRIPTION'
                          ? 'Describe the issue (e.g. broken pothole)...'
                          : 'Describe an issue or send a photo...'
                  }
                  rows={1}
                  disabled={busy || status === 'DONE'}
                  className="max-h-24 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white shadow-xs transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600/30 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <Send size={15} />
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
