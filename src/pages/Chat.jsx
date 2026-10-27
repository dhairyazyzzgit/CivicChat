import { ArrowUp, Check, Image as ImageIcon, Plus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import CameraCapture from '../components/chat/CameraCapture';
import ChipsRow from '../components/chat/ChipsRow';
import ConfirmationCard from '../components/chat/ConfirmationCard';
import { BrandMark } from '../components/common/BrandMark';
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

function stepLabel(status) {
  const current = stepIndex(status);
  return current >= 4 ? 'Report submitted' : `Step ${current + 1} of 4 · ${STEPS[current]}`;
}

function ProgressSteps({ status }) {
  const current = stepIndex(status);
  return (
    <div className="border-b border-slate-100 bg-white px-5 pb-3.5 pt-1 sm:px-8" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.min(current, 4)} aria-label={stepLabel(status)}>
      <ol className="flex items-start">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className="relative flex flex-1 flex-col items-center">
              {i > 0 && (
                <span
                  className={`absolute right-1/2 top-[15px] h-[3px] w-full -translate-y-1/2 rounded-full transition-colors duration-500 ${i <= current ? 'bg-blue-600' : 'bg-slate-200'}`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-extrabold transition-all duration-500 ${
                  done
                    ? 'bg-blue-700 text-white shadow-md shadow-blue-700/30'
                    : active
                      ? 'scale-110 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/40 ring-4 ring-blue-100'
                      : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'
                }`}
              >
                {done ? <Check size={16} strokeWidth={3.5} /> : i + 1}
              </span>
              <span className={`mt-2 text-[11.5px] font-bold tracking-tight transition-colors ${active ? 'text-blue-700' : done ? 'text-slate-700' : 'text-slate-400'}`}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
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
  const isFresh = status === 'IDLE' && messages.length <= 1;

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
    <main className="flex h-[calc(100dvh-72px)] items-stretch justify-center bg-gradient-to-br from-slate-100 to-slate-50 sm:items-center sm:bg-slate-100/80 sm:px-4 sm:py-4">
      <div className="flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-white sm:rounded-[1.5rem] sm:border sm:border-slate-200 sm:shadow-xl sm:h-[min(100%,860px)]">
        <header className="flex items-center justify-between gap-3 bg-white px-4 pb-3.5 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md shadow-blue-900/20">
              <ShieldCheck size={19} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-[15px] font-bold leading-none text-slate-900">SHIKAAYAT Assistant</h1>
              <p className="mt-1.5 truncate text-[11.5px] font-medium leading-none text-slate-500" aria-live="polite">{status === 'DONE' ? 'Report submitted ✓' : 'Ready when you are'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewReport}
            className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-b from-blue-600 to-blue-800 pl-3 pr-4 text-[13px] font-bold text-white shadow-md shadow-blue-800/30 ring-1 ring-blue-900/20 transition hover:brightness-110 active:scale-95"
            aria-label="Start a new report"
          >
            <Plus size={16} strokeWidth={3} />
            <span>New</span>
          </button>
        </header>
        <ProgressSteps status={status} />

     <div className="flex min-h-0 flex-1 flex-col">
  <div className={`chat-bg flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6 ${isFresh ? 'fresh-glow flex flex-col' : 'space-y-3'}`}>
    {(isFresh ? [] : messages).map((message) => {
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
<div className="message-enter mx-auto my-auto flex w-full max-w-sm flex-col items-center px-2 pb-4 text-center">                <div className="relative mb-7">
                  <span className="absolute -inset-6 rounded-full bg-blue-500/20 blur-2xl" aria-hidden="true" />
                  <div className="animate-floaty relative"><BrandMark size={72} /></div>
                </div>
                <h2 className="display text-[2.15rem] leading-[1.05] text-slate-900 sm:text-[2.6rem]">
                  Spot a problem?<br />
                  <span className="bg-gradient-to-r from-blue-700 to-sky-500 bg-clip-text text-transparent">Let&apos;s fix it.</span>
                </h2>
                <p className="mt-4 max-w-[19rem] text-[15.5px] font-medium leading-relaxed text-slate-600">
                  One photo is all it takes. We find the issue, pin the spot and send it to the right team.
                </p>
                <div className="mt-8 w-full space-y-2.5">
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
                    className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white text-[15px] font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-800 active:scale-[0.98] disabled:opacity-50"
                  >
                    <ImageIcon size={17} /> Choose from gallery
                  </button>
                </div>
                <p className="mt-6 text-[13px] font-medium text-slate-500">
                  Emergency? <a href="tel:112" className="font-semibold text-slate-600 underline-offset-2 hover:underline">Call 112</a>
                </p>
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

            <div className="flex items-end gap-1 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-1.5 shadow-xs transition focus-within:border-blue-700/50 focus-within:bg-white focus-within:shadow-sm">
              {!isFresh && <CameraCapture
                disabled={busy || status === 'DONE'}
                cameraInputRef={cameraInputRef}
                onCapture={setPendingFile}
                onError={setCameraError}
              />}
              {!isFresh && <button
                type="button"
                title="Choose from gallery"
                aria-label="Choose from gallery"
                onClick={openGallery}
                disabled={busy || status === 'DONE'}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/60 hover:text-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ImageIcon size={19} />
              </button>}

              <div className="relative min-w-0 flex-1">
                {!input && (
                  <span className={`pointer-events-none absolute inset-y-0 ${isFresh ? 'left-4' : 'left-2'} right-1 flex items-center overflow-hidden whitespace-nowrap text-[15px] text-slate-400`} aria-hidden="true">
                    <span className="truncate">
                      {busy
                        ? 'CivicBot is working…'
                        : status === 'AWAIT_NOTE'
                          ? 'Add landmark or notes…'
                          : status === 'AWAIT_DESCRIPTION'
                            ? 'Describe the issue…'
                            : (<><span className="sm:hidden">Describe an issue…</span><span className="hidden sm:inline">Describe an issue or send a photo…</span></>)}
                    </span>
                  </span>
                )}
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onKeyDown}
                  aria-label="Describe an issue or send a photo"
                  rows={1}
                  disabled={busy || status === 'DONE'}
                  className={`block max-h-28 min-h-[40px] w-full resize-none border-0 bg-transparent ${isFresh ? 'pl-4 pr-2' : 'px-2'} py-2.5 text-[15px] leading-snug text-slate-900 focus:outline-none disabled:cursor-not-allowed`}
                />
              </div>

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
