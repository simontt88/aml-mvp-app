import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Eye, Clock, CheckCircle, AlertCircle } from 'lucide-react';
// no types needed from legacy hits
import { v2Api, SourceCaseDTO, BatchCaseStatusRequestDTO } from '../services/api';
import { format } from 'date-fns';

const Dashboard: React.FC = () => {
  const [cases, setCases] = useState<SourceCaseDTO[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [allProfileIds, setAllProfileIds] = useState<string[]>([]);
  const [caseStatuses, setCaseStatuses] = useState<Record<string, any>>({});
  
  const ITEMS_PER_PAGE = 20;

  const loadCases = async (page: number = 0, profileId?: string) => {
    try {
      setLoading(true);
      const data = await v2Api.listCases({ skip: page * ITEMS_PER_PAGE, limit: ITEMS_PER_PAGE, profile_unique_id: profileId });
      
      // Batch fetch case statuses for all cases
      const pairs: BatchCaseStatusRequestDTO['pairs'] = data.map((c) => ({ profile_unique_id: c.profile_unique_id, dj_profile_id: c.dj_profile_id }));
      let statusesItems: { key: string; status: any }[] = [];
      try {
        const batch = await v2Api.batchGetCaseStatus({ pairs });
        statusesItems = batch.items.map(({ profile_unique_id, dj_profile_id, status }) => ({
          key: `${profile_unique_id}-${dj_profile_id}`,
          status,
        }));
      } catch (e) {
        // Fallback: mark all as unreviewed on batch fail
        statusesItems = pairs.map((p) => ({ key: `${p.profile_unique_id}-${p.dj_profile_id}`, status: { case_status: 'unreviewed' } }));
      }
      const statusMap = statusesItems.reduce((acc, { key, status }) => {
        acc[key] = status;
        return acc;
      }, {} as Record<string, any>);
      
      // Sort cases: unreviewed first, then by status priority
      const sortedData = [...data].sort((a, b) => {
        const aKey = `${a.profile_unique_id}-${a.dj_profile_id}`;
        const bKey = `${b.profile_unique_id}-${b.dj_profile_id}`;
        const aStatus = statusMap[aKey]?.case_status || 'unreviewed';
        const bStatus = statusMap[bKey]?.case_status || 'unreviewed';
        
        // Priority order: unreviewed > draft > in_review > submitted > closed
        const statusPriority = { unreviewed: 0, draft: 1, in_review: 2, submitted: 3, closed: 4 };
        return (statusPriority[aStatus as keyof typeof statusPriority] || 0) - (statusPriority[bStatus as keyof typeof statusPriority] || 0);
      });
      
      if (page === 0) {
        setCases(sortedData);
        setCaseStatuses(statusMap);
      } else {
        setCases(prev => [...prev, ...sortedData]);
        setCaseStatuses(prev => ({ ...prev, ...statusMap }));
      }
      
      setHasMore((data?.length || 0) === ITEMS_PER_PAGE);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load cases:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load all profile IDs for navigation
  const loadAllProfileIds = async () => {
    try {
      const allCases = await v2Api.listCases({ skip: 0, limit: 1000 }); // Get enough to capture all profiles
      const uniqueIds = Array.from(new Set(allCases.map(c => c.profile_unique_id)));
      setAllProfileIds(uniqueIds);
    } catch (error) {
      console.error('Failed to load profile IDs:', error);
    }
  };

  useEffect(() => {
    loadCases(0, selectedProfileId);
  }, [selectedProfileId]);

  // On first mount, load profile IDs and choose the first one
  useEffect(() => {
    (async () => {
      try {
        await loadAllProfileIds();
        const initial = await v2Api.listCases({ skip: 0, limit: ITEMS_PER_PAGE });
        if (initial && initial.length > 0) {
          setSelectedProfileId(initial[0].profile_unique_id);
        }
      } catch (e) {
        console.error('Failed initial hits load', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(0);
    const profileId = search.trim() || undefined;
    setSelectedProfileId(profileId);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      loadCases(currentPage + 1, selectedProfileId);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      unreviewed: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800', label: 'Unreviewed' },
      draft: { icon: Clock, color: 'bg-gray-100 text-gray-800', label: 'Draft' },
      in_review: { icon: Eye, color: 'bg-blue-100 text-blue-800', label: 'In Review' },
      submitted: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Submitted' },
      closed: { icon: CheckCircle, color: 'bg-gray-100 text-gray-600', label: 'Closed' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unreviewed;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const getRiskLabel = (finalScore?: number) => {
    if (finalScore === undefined || finalScore === null) return { label: 'Unknown', color: 'text-gray-600 bg-gray-50', icon: AlertCircle };
    if (finalScore >= 70) return { label: 'High', color: 'text-red-600 bg-red-50', icon: AlertCircle };
    if (finalScore >= 30) return { label: 'Medium', color: 'text-yellow-600 bg-yellow-50', icon: AlertCircle };
    return { label: 'Low', color: 'text-green-600 bg-green-50', icon: CheckCircle };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AML Screening Cases</h1>
          <p className="text-gray-600">Review and process AML screening matches</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">
            {cases.length} cases {hasMore && '(loading more...)'}
          </span>
          <div className="hidden lg:flex items-center gap-2">
            <button className="px-2 py-1 border rounded text-sm" onClick={() => {
              if (allProfileIds.length === 0) return;
              const current = selectedProfileId ?? allProfileIds[0];
              const idx = allProfileIds.indexOf(current);
              const nextIdx = (idx - 1 + allProfileIds.length) % allProfileIds.length;
              const next = allProfileIds[nextIdx];
              setSelectedProfileId(next);
              setSearch(next);
              setCurrentPage(0); // Reset pagination
            }}>Prev Profile</button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => {
              if (allProfileIds.length === 0) return;
              const current = selectedProfileId ?? allProfileIds[0];
              const idx = allProfileIds.indexOf(current);
              const nextIdx = (idx + 1) % allProfileIds.length;
              const next = allProfileIds[nextIdx];
              setSelectedProfileId(next);
              setSearch(next);
              setCurrentPage(0); // Reset pagination
            }}>Next Profile</button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" placeholder="Filter by Profile ID (exact) to show its hits..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500">Apply</button>
          <button type="button" className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-blue-500" onClick={() => { setSearch(''); setSelectedProfileId(undefined); setCurrentPage(0); }}>
            <Filter className="w-4 h-4" />
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: selected profile summary */}
        <div className="bg-white rounded-lg shadow-sm border p-6 lg:col-span-1">
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">Profile ID</div>
              <div className="font-mono">{selectedProfileId || '—'}</div>
            </div>
            {(() => {
              // Find the first case that matches the selected profile ID to ensure sync
              const profileCase = cases.find(c => c.profile_unique_id === selectedProfileId);
              return profileCase ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Entity ID</div>
                      <div className="font-mono">{profileCase.dj_profile_id || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Reference ID</div>
                      <div className="font-mono">{profileCase.reference_id || '—'}</div>
                    </div>
                  </div>
                  {profileCase.profile_info && (
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-gray-600">Name</div>
                        <div className="font-medium">{(profileCase.profile_info as any).profile_name || '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">DOB</div>
                        <div className="font-medium">{(profileCase.profile_info as any).profile_dob || '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Nationality</div>
                        <div className="font-medium">{(profileCase.profile_info as any).profile_nationality || '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">ID Number</div>
                        <div className="font-medium">{(profileCase.profile_info as any).profile_idnumber || '—'}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : selectedProfileId && cases.length > 0 ? (
                <div className="text-gray-500 text-sm">Loading profile information...</div>
              ) : null;
            })()}
          </div>
        </div>

        {/* Right cases list */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden lg:col-span-2">
        <div className="overflow-x-auto">
           <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match Level</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cases.map((sc) => {
                const match = getRiskLabel(sc.final_score);
                const RiskIcon = match.icon;
                const caseKey = `${sc.profile_unique_id}-${sc.dj_profile_id}`;
                const caseStatus = caseStatuses[caseKey];
                const actualStatus = caseStatus?.case_status || 'unreviewed';
                
                return (
                  <tr key={caseKey} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900">{sc.dj_profile_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sc.candidate_name || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${match.color}`}><RiskIcon className="w-3 h-3 mr-1" />{match.label}{sc.final_score !== undefined ? ` (${Math.round(sc.final_score)}%)` : ''}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(actualStatus)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{caseStatus?.last_updated_by ? `Operator ${caseStatus.last_updated_by}` : '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(sc.created_at), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium"><Link to={`/case/${sc.profile_unique_id}`} className="inline-flex items-center px-3 py-1 border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 focus:ring-2 focus:ring-blue-500"><Eye className="w-4 h-4 mr-1" />Review</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {loading && (<div className="px-6 py-8 text-center lg:col-span-3"><div className="text-gray-500">Loading...</div></div>)}
        {!loading && cases.length === 0 && (<div className="px-6 py-8 text-center lg:col-span-3"><div className="text-gray-500">No profiles found</div></div>)}
        {!loading && hasMore && cases.length > 0 && (<div className="px-6 py-4 border-t border-gray-200 text-center lg:col-span-3"><button onClick={loadMore} className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium">Load More Cases</button></div>)}
      </div>
      </div>
    </div>
  );
};

export default Dashboard;