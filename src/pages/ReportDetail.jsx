import { useParams } from 'react-router-dom';

function ReportDetailPage() {
  const { id } = useParams();

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-primary">Report Detail</h1>
        <p className="mt-3 text-slate-600">Report ID: {id}</p>
      </div>
    </main>
  );
}

export default ReportDetailPage;
