import { ArrowLeft, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/common/BrandMark';

function NotFoundPage() {
  return (
    <main className="fresh-glow flex min-h-[calc(100vh-72px)] items-center justify-center p-6">
      <div className="message-enter w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-xl sm:p-12">
        <div className="mx-auto mb-6 flex justify-center"><BrandMark size={56} /></div>
        <p className="display bg-gradient-to-r from-blue-700 to-sky-500 bg-clip-text text-[5.5rem] leading-none text-transparent">404</p>
        <h1 className="mt-4 text-xl font-bold text-slate-900">This page wandered off</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-500">We couldn&apos;t find what you were looking for. Let&apos;s get you back on track.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/" className="btn btn-primary !min-h-12"><ArrowLeft size={16} /> Back to home</Link>
          <Link to="/chat" className="btn btn-ghost !min-h-12"><Camera size={16} /> Report an issue</Link>
        </div>
      </div>
    </main>
  );
}

export default NotFoundPage;
