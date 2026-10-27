import { ArrowUp, Image as ImageIcon, MapPin, Plus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import CameraCapture from '../components/chat/CameraCapture';
import ChipsRow from '../components/chat/ChipsRow';
import ConfirmationCard from '../components/chat/ConfirmationCard';
import ErrorMessage from '../components/chat/ErrorMessage';
import ImageMessage from '../components/chat/ImageMessage';
import LocationStatus from '../components/chat/LocationStatus';
import MapCard from '../components/chat/MapCard';
import TextMessage from '../components/chat/TextMessage';
import { useChatFlow } from '../hooks/useChatFlow';
import { ACCEPT_IMAGE_INPUT } from '../lib/uploadLimits';

function BotAvatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand text-blue-100 shadow-sm">
      <span className="text-sm font-semibold">S</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5 rounded-[20px] rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 shadow-xs">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((value) => (
          <span
            key={value}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-700/70"
            style={{ animationDelay: `${value * 140}ms` }}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-slate-500">CivicBot is thinking…</span>
    </div>
  );
}

const STEPS = ['Photo', 'Location', 'Details', 'Submit'];

function stepIndex(status) {
  switch (status) {
    case 'IDLE':
    case 'PROCESSING':
      return 0;
    case 'LOCATING':
    case 'CONFIRM_LOCATION':
    case 'ADJUST_LOCATION':
      return 1;
    case 'WAIT_AI':
    case 'CONFIRM_CATEGORY':
    case 'PICK_CATEGORY':
    case 'AWAIT_DESCRIPTION':
    case 'AWAIT_NOTE':
      return 2;
    case 'CHECKING_DUPLICATES':
    case 'SUBMITTING':
      return 3;
    case 'DONE':
      return 4;
    default:
      return 0;
  }
}

function ProgressSteps({ status }) {
  const current = stepIndex(status);
  const label = current >= 4 ? 'Submitted' : STEPS[current];
  return (
    <div className="bg-white px-4 pb-3 pt-1 sm:px-6" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.min(current, 4)} aria-label="Report progress">
      <div className="flex gap-1.5">
        {STEPS.map((step, i) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < current ? 'bg-brand' : i === current ? 'bg-accent' : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-500">
        {current >= 4 ? 'Done · Your report is in' : `Step ${current + 1} of 4 · ${label}`}
      </p>
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
    retryLocation,
    skipToManualLocation,
  } = useChatFlow();

  const scrollRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const pendingUrlRef = useRef('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const isFresh = status === 'IDLE' && messages.length <= 1 && !pendingPhoto;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing, interaction, error, pendingPhoto]);

  useEffect(() => {
    return () => {
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    };
  }, []);

  const setPendingFile = (file) => {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    if (!file) {
      pendingUrlRef.current = '';
      setPendingPhoto(null);
      return;
    }
    const url = URL.createObjectURL(file);
    pendingUrlRef.current = url;
    setPendingPhoto({ file, url });
    setCameraError('');
  };

  const openGallery = () => galleryInputRef.current?.click();

  const onImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingFile(file);
  };

  const sendPendingPhoto = async () => {
    if (!pendingPhoto?.file || busy) return;
    const file = pendingPhoto.file;
    setPendingFile(null);
    await handlePhotoSelect(file);
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
    setPendingFile(null);
    reset();
  };

  return (
    <main className="flex h-[calc(100dvh-88px)] items-stretch justify-center bg-gradient-to-br from-slate-100 to-slate-50 sm:items-center sm:bg-slate-100/80 sm:px-4 sm:py-4">
      <div className="flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-white sm:rounded-[1.5rem] sm:border sm:border-slate-200 sm:shadow-xl sm:h-[min(100%,860px]">
        <header className="flex items-center justify-between bg-white px-4 pb-4 pt-5 sm:px-6 sm:pt-6 sm:pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg">
              <span className="text-xl font-black">S</span>
            </div>
            <div>
              <h1 className="font-display text-[16px] font-bold leading-none text-slate-900">SHIKAAYAT Assistant</h1>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online · replies instantly
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewReport}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
            aria-label="Start a new report"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </header>
        <ProgressSteps status={status} />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="chat-bg flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6">
            {messages.map((message) => {
              if (message.role === 'bot') {
                return (
                  <div key={message.id} className="message-enter flex items-start gap-2.5">
                    <BotAvatar />
                    <div className="min-w-0 max-w-[88%] sm:max-w-[82%]">
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
                <div key={message.id} className="message-enter flex justify-end">
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

            {isFresh && (
              <div className="message-enter mx-auto mt-6 w-full max-w-md overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-xl">
                <div className="bg-gradient-to-br from-blue-50 to-white px-6 pb-8 pt-10 text-center">
                  <p className="eyebrow">Quick report</p>
                  <h2 className="display mt-5 text-[2.2rem] text-slate-900">
                    What&apos;s the <span className="text-blue-700">problem?</span>
                  </h2>
                  <p className="text-lead mx-auto mt-4 max-w-[18rem] font-medium">
                    Start with a photo. We&apos;ll detect the issue and your location.
                  </p>
                </div>
                <div className="space-y-4 px-5 pb-8 pt-3">
                  <CameraCapture
                    variant="hero"
                    disabled={busy}
                    cameraInputRef={cameraInputRef}
                    onCapture={setPendingFile}
                    onError={setCameraError}
                  />
                  <button
                    type="button"
                    onClick={openGallery}
                    disabled={busy}
                    className="btn btn-ghost w-full !min-h-[52px]"
                  >
                    <ImageIcon size={18} /> Choose from gallery
                  </button>
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-blue-700" /> Auto location</span>
                    <span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-blue-700" /> Issue detection</span>
                    <span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-blue-700" /> Private</span>
                  </div>
                  <p className="pt-1 text-center text-[11px] text-slate-400">Or describe it in the box below. In danger, call 112.</p>
                </div>
              </div>
            )}

            {interaction?.kind === 'locating' && (
              <div className="message-enter flex items-start gap-2.5">
                <BotAvatar />
                <LocationStatus
                  phase={interaction.phase}
                  onRetry={retryLocation}
                  onUseMap={skipToManualLocation}
                />
              </div>
            )}

            {interaction?.kind === 'location' && (
              <div className="message-enter flex items-start gap-2.5">
                <BotAvatar />
                <div className="min-w-0 max-w-[92%] sm:max-w-[85%]">
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
              <div className="message-enter flex justify-start pl-[42px]">
                <ChipsRow options={interaction.options} onSelect={handleChipSelect} disabled={busy} />
              </div>
            )}

            {typing && (
              <div className="flex items-start gap-2.5">
                <BotAvatar />
                <TypingIndicator />
              </div>
            )}

            {error && (
              <div className="flex justify-start pl-[42px]">
                <ErrorMessage text={error.text} onRetry={error.retryAction ? retry : undefined} />
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          <div className="pb-safe border-t border-slate-200/70 bg-white px-3 pt-3 sm:px-5 sm:pb-4">
            {cameraError && <p className="mb-2 px-1 text-xs text-rose-700">{cameraError}</p>}
            {pendingPhoto && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                <img src={pendingPhoto.url} alt="Photo preview" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900">Use this photo?</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={sendPendingPhoto}
                      disabled={busy}
                      className="btn btn-primary !min-h-9 !px-4 !text-xs"
                    >
                      Use photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFile(null);
                        cameraInputRef.current?.click();
                      }}
                      className="rounded-full px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60"
                    >
                      Retake
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="self-start rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                  aria-label="Remove photo"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept={ACCEPT_IMAGE_INPUT}
              capture="environment"
              className="hidden"
              onChange={onImageChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept={ACCEPT_IMAGE_INPUT}
              className="hidden"
              onChange={onImageChange}
            />

            <div className="flex items-end gap-1 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-1.5 shadow-xs transition focus-within:border-blue-700/50 focus-within:bg-white focus-within:shadow-sm">
              <CameraCapture
                disabled={busy || status === 'DONE'}
                cameraInputRef={cameraInputRef}
                onCapture={setPendingFile}
                onError={setCameraError}
              />
              <button
                type="button"
                title="Choose from gallery"
                aria-label="Choose from gallery"
                onClick={openGallery}
                disabled={busy || status === 'DONE'}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/60 hover:text-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ImageIcon size={19} />
              </button>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  busy
                    ? 'CivicBot is working…'
                    : status === 'AWAIT_NOTE'
                      ? 'Add landmark details or notes…'
                      : status === 'AWAIT_DESCRIPTION'
                        ? 'Describe the issue…'
                        : 'Describe an issue or send a photo…'
                }
                rows={1}
                disabled={busy || status === 'DONE'}
                className="max-h-28 min-h-[40px] min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[15px] leading-snug text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
              />

              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ChatPage;
