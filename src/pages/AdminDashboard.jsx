import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminNavbar } from '../components/admin/AdminNavbar';
import { IssueDetailPanel } from '../components/admin/IssueDetailPanel';
import { IssueList } from '../components/admin/IssueList';
import { IssueMap } from '../components/admin/IssueMap';
import { StatCards } from '../components/admin/StatCards';
import { supabase } from '../lib/supabase';

function AdminDashboardPage() {
  const location = useLocation();
  const [issues, setIssues] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedId, setSelectedId] = useState(location.state?.selectedGroupId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileTab, setMobileTab] = useState('map'); // 'map' or 'list'

  useEffect(() => {
    if (location.state?.selectedGroupId) {
      setSelectedId(location.state.selectedGroupId);
    }
  }, [location.state?.selectedGroupId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all issues from issue_groups_ranked (admin has RLS access)
      const { data: issuesData, error: issuesError } = await supabase
        .from('issue_groups_ranked')
        .select('*')
        .order('created_at', { ascending: false });

      if (issuesError) throw issuesError;
      setIssues(issuesData || []);

      // Fetch departments for filter
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id, name');

      if (deptError) throw deptError;
      setDepartments(deptData || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedIssue = issues.find((i) => i.id === selectedId);

  return (
    <>
    <AdminNavbar onRefresh={fetchData} loading={loading} onSelectIssue={setSelectedId} />
    <main className="min-h-[calc(100vh-88px)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Stat Cards */}
        <StatCards issues={issues} />

        {/* Error State */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-center">
            <p className="text-sm font-medium text-rose-700">{error}</p>
          </div>
        )}

        {/* Main Content */}
        {!error && (
          <>
            {/* Mobile Tabs */}
            <div className="flex gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setMobileTab('map')}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  mobileTab === 'map'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('list')}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  mobileTab === 'list'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                List
              </button>
            </div>

            {/* Desktop: Two-column layout */}
            <div className="hidden sm:grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Map */}
              <div>
                <p className="eyebrow mb-3">Issue map</p>
                <IssueMap issues={issues} selectedId={selectedId} onSelect={setSelectedId} />
              </div>

              {/* Right: List */}
              <div>
                <p className="eyebrow mb-3">Issue list</p>
                <IssueList
                  issues={issues}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  departments={departments}
                />
              </div>
            </div>

            {/* Mobile: Single view based on tab */}
            <div className="sm:hidden">
              {mobileTab === 'map' ? (
                <IssueMap issues={issues} selectedId={selectedId} onSelect={setSelectedId} />
              ) : (
                <IssueList
                  issues={issues}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  departments={departments}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail Panel (side panel on desktop, bottom sheet on mobile) */}
      {selectedIssue && (
        <IssueDetailPanel issue={selectedIssue} onClose={() => setSelectedId(null)} onUpdate={fetchData} />
      )}
    </main>
    </>
  );
}

export default AdminDashboardPage;
