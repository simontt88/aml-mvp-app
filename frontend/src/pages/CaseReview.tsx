import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, MapPin, AlertTriangle, Save, Send, BookmarkCheck } from 'lucide-react';
import { AspectType, FinalVerdict } from '../types';
import { v2Api, AspectFeedbackDTO, AspectFeedbackCreateDTO } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import AspectCard from '../components/AspectCard';
import WorldCheckRecordViewer from '../components/WorldCheckRecordViewer';
import { format } from 'date-fns';

const CaseReview: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  useAuth();
  const [sourceCase, setSourceCase] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalVerdict, setFinalVerdict] = useState<FinalVerdict | undefined>();
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [caseStatus, setCaseStatus] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [aspectFeedbacks, setAspectFeedbacks] = useState<AspectFeedbackDTO[]>([]);
  const [pendingFeedbacks, setPendingFeedbacks] = useState<Record<string, { feedback: string; comment: string }>>({});
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (profileId) {
      loadCaseDetail();
    }
  }, [profileId]);

  const loadCaseDetail = async () => {
    try {
      setLoading(true);
      const cases = await v2Api.listCases({ profile_unique_id: profileId!, limit: 1 });
      if (!cases || cases.length === 0) { setSourceCase(null); setLoading(false); return; }
      const sc = cases[0];
      setSourceCase(sc);

      // Try to load existing case status
      try {
        const status = await v2Api.getCaseStatus(sc.profile_unique_id, sc.dj_profile_id);
        setCaseStatus(status);
        
        if (status?.aspects_status) {
          const aspectsStatus = status.aspects_status as any;
          if (aspectsStatus.final_verdict) {
            setFinalVerdict(aspectsStatus.final_verdict);
          }
          if (aspectsStatus.comments) {
            setComments(aspectsStatus.comments);
          }
        }
        
        // Set editing state based on case status
        const isSubmitted = status?.case_status === 'submitted';
        setIsEditing(!isSubmitted);
      } catch (statusError) {
        // Case status doesn't exist yet, which is fine for new cases
        console.log('No existing case status found (new case)');
        setCaseStatus({ case_status: 'unreviewed' });
        setIsEditing(true);
      }

      // Load existing aspect feedbacks
      try {
        const feedbacks = await v2Api.getAspectFeedback(sc.profile_unique_id, sc.dj_profile_id);
        setAspectFeedbacks(feedbacks);
      } catch (feedbackError) {
        console.log('No existing aspect feedbacks found');
        setAspectFeedbacks([]);
      }
    } catch (error) {
      console.error('Failed to load case detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAspectData = (aspectType: AspectType) => {
    if (!sourceCase) return null;
    const key = aspectType === 'name' ? 'aspect_name_json' : aspectType === 'age' ? 'aspect_age_json' : aspectType === 'nationality' ? 'aspect_nationality_json' : 'aspect_risk_json';
    const txt = sourceCase[key];
    if (!txt) return null;
    return { output: txt, score: sourceCase.final_score || 0 };
  };

  const handleAspectFeedback = (aspectType: string, feedback: string, comment?: string) => {
    setPendingFeedbacks(prev => ({
      ...prev,
      [aspectType]: { feedback, comment: comment || '' }
    }));
  };

  const handleSaveAllFeedbacks = async () => {
    if (!sourceCase || Object.keys(pendingFeedbacks).length === 0) return;

    try {
      setSavingFeedback(true);
      
      const feedbackPromises = Object.entries(pendingFeedbacks).map(([aspectType, data]) => {
        const aspectData = getAspectData(aspectType as AspectType);
        const feedbackPayload: AspectFeedbackCreateDTO = {
          aspect_type: aspectType,
          llm_output: aspectData?.output || '',
          llm_verdict_score: aspectData?.score || 0,
          operator_feedback: data.feedback,
          operator_comment: data.comment
        };
        
        return v2Api.createAspectFeedback(sourceCase.profile_unique_id, sourceCase.dj_profile_id, feedbackPayload);
      });

      const savedFeedbacks = await Promise.all(feedbackPromises);
      
      // Update the aspect feedbacks state
      setAspectFeedbacks(prev => {
        const updated = [...prev];
        savedFeedbacks.forEach(newFeedback => {
          const existingIndex = updated.findIndex(f => f.aspect_type === newFeedback.aspect_type);
          if (existingIndex >= 0) {
            updated[existingIndex] = newFeedback;
          } else {
            updated.push(newFeedback);
          }
        });
        return updated;
      });

      // Clear pending feedbacks
      setPendingFeedbacks({});

      // Log the feedback save action
      await v2Api.appendLog(sourceCase.profile_unique_id, sourceCase.dj_profile_id, {
        event_type: 'aspect_feedback_saved',
        payload: {
          feedbacks_count: savedFeedbacks.length,
          aspect_types: savedFeedbacks.map(f => f.aspect_type)
        }
      });

      setNotification({ type: 'success', message: 'Aspect feedbacks saved successfully!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Failed to save aspect feedbacks:', error);
      setNotification({ type: 'error', message: 'Failed to save aspect feedbacks. Please try again.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSavingFeedback(false);
    }
  };

  const getExistingFeedback = (aspectType: string) => {
    return aspectFeedbacks.find(f => f.aspect_type === aspectType);
  };

  const handleSaveDraft = async () => {
    if (!sourceCase) return;
    
    try {
      setSubmitting(true);
      
      // Update case status to draft
      const updatedStatus = await v2Api.updateCaseStatus(sourceCase.profile_unique_id, sourceCase.dj_profile_id, {
        case_status: 'draft',
        aspects_status: {
          final_verdict: finalVerdict,
          comments: comments,
          updated_at: new Date().toISOString()
        }
      });

      // Log the draft save action
      await v2Api.appendLog(sourceCase.profile_unique_id, sourceCase.dj_profile_id, {
        event_type: 'draft_saved',
        payload: {
          final_verdict: finalVerdict,
          comments: comments,
          previous_status: caseStatus?.case_status || 'unreviewed'
        }
      });

      // Update local state
      setCaseStatus(updatedStatus);

      setNotification({ type: 'success', message: 'Draft saved successfully!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Failed to save draft:', error);
      setNotification({ type: 'error', message: 'Failed to save draft. Please try again.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCase = async () => {
    if (!sourceCase || !finalVerdict) return;
    
    try {
      setSubmitting(true);
      
      // Update case status to submitted
      const updatedStatus = await v2Api.updateCaseStatus(sourceCase.profile_unique_id, sourceCase.dj_profile_id, {
        case_status: 'submitted',
        aspects_status: {
          final_verdict: finalVerdict,
          comments: comments,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      });

      // Log the submission action
      await v2Api.appendLog(sourceCase.profile_unique_id, sourceCase.dj_profile_id, {
        event_type: 'case_submitted',
        payload: {
          final_verdict: finalVerdict,
          comments: comments,
          previous_status: caseStatus?.case_status || 'unreviewed'
        }
      });

      // Update local state
      setCaseStatus(updatedStatus);
      setIsEditing(false);

      setNotification({ type: 'success', message: 'Case submitted successfully!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Failed to submit case:', error);
      setNotification({ type: 'error', message: 'Failed to submit case. Please try again.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading case details...</div>
      </div>
    );
  }

  if (!sourceCase) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Case not found</div>
      </div>
    );
  }

  const profile = { profile_unique_id: sourceCase.profile_unique_id, profile_info: sourceCase.profile_info || {}, created_at: sourceCase.created_at } as any;
  const hit = { dj_profile_id: sourceCase.dj_profile_id, reference_id: sourceCase.reference_id, structured_record: sourceCase.structured_record } as any;

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
          notification.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {notification.message}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Cases
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Case Review: {profile.profile_info?.profile_name || sourceCase.candidate_name || hit.dj_profile_id}</h1>
            <p className="text-gray-600">Profile ID: {profile.profile_unique_id}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm text-gray-500">
          <div>Created: {format(new Date(profile.created_at), 'MMM dd, yyyy HH:mm')}</div>
          {caseStatus && (
            <div className="flex items-center space-x-2">
              <span>Status:</span>
              {(() => {
                const statusConfig = {
                  unreviewed: { color: 'bg-yellow-100 text-yellow-800', label: 'Unreviewed' },
                  draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },
                  in_review: { color: 'bg-blue-100 text-blue-800', label: 'In Review' },
                  submitted: { color: 'bg-green-100 text-green-800', label: 'Submitted' },
                  closed: { color: 'bg-gray-100 text-gray-600', label: 'Closed' }
                };
                const config = statusConfig[caseStatus.case_status as keyof typeof statusConfig] || statusConfig.unreviewed;
                return (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Top: Customer Profile full width */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border min-h-[180px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Customer Profile</h2>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {profile.profile_info?.profile_name || sourceCase.candidate_name || '—'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded border border-gray-300 bg-gray-50">
                Entity ID: <span className="font-mono">{hit.dj_profile_id}</span>
              </span>
              <span className="px-2 py-1 rounded border border-gray-300 bg-gray-50">
                Reference ID: <span className="font-mono">{hit.reference_id || '—'}</span>
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500 uppercase tracking-wide text-[11px]">Nationality</div>
              <div className="font-medium">{profile.profile_info?.profile_nationality || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500 uppercase tracking-wide text-[11px]">ID Number</div>
              <div className="font-medium">{profile.profile_info?.profile_idnumber || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500 uppercase tracking-wide text-[11px]">DOB</div>
              <div className="font-medium">{profile.profile_info?.profile_dob || '—'}</div>
            </div>
          </div>

          {profile.profile_info?.profile_sourceofname && (
            <div className="mt-4 text-xs text-gray-500 text-right">
              Source: {profile.profile_info?.profile_sourceofname}
            </div>
          )}
        </div>

        {/* Below: 4 / 6 split */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          <div className="lg:col-span-4 space-y-6">
            {hit && (
              <WorldCheckRecordViewer structuredRecord={hit.structured_record} />
            )}
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h2 className="text-lg font-semibold mb-4">AI Analysis</h2>
              <div className="space-y-4">
                <AspectCard 
                  title="Name Analysis" 
                  icon={<FileText className="w-4 h-4" />} 
                  llmOutput={getAspectData('name')?.output || ''} 
                  status={(function(){ try { const obj=JSON.parse(getAspectData('name')?.output||'{}'); const v=obj.category?.verdict; if (v==='strong_match') return 'match'; if (v==='likely_no_match') return 'different'; return 'unclear'; } catch { return 'unclear'; } })()} 
                  statusLabel={(function(){ try { const obj=JSON.parse(getAspectData('name')?.output||'{}'); return obj.category?.verdict||undefined; } catch { return undefined; } })()} 
                  existingFeedback={getExistingFeedback('name') as any} 
                  onFeedbackSubmit={(feedback, comment) => handleAspectFeedback('name', feedback, comment)} 
                />
                <AspectCard 
                  title="Age/Timeline Analysis" 
                  icon={<FileText className="w-4 h-4" />} 
                  llmOutput={getAspectData('age')?.output || ''} 
                  status={(function(){ try { const obj=JSON.parse(getAspectData('age')?.output||'{}'); const v=obj.category?.verdict; if (v==='strong_match') return 'match'; if (v==='likely_no_match') return 'different'; return 'unclear'; } catch { return 'unclear'; } })()} 
                  statusLabel={(function(){ try { const obj=JSON.parse(getAspectData('age')?.output||'{}'); return obj.category?.verdict||undefined; } catch { return undefined; } })()} 
                  existingFeedback={getExistingFeedback('age') as any} 
                  onFeedbackSubmit={(feedback, comment) => handleAspectFeedback('age', feedback, comment)} 
                />
                <AspectCard 
                  title="Location Analysis" 
                  icon={<MapPin className="w-4 h-4" />} 
                  llmOutput={getAspectData('nationality')?.output || ''} 
                  status={(function(){ try { const obj=JSON.parse(getAspectData('nationality')?.output||'{}'); const v=obj.category?.verdict; if (v==='strong_match') return 'match'; if (v==='likely_no_match') return 'different'; return 'unclear'; } catch { return 'unclear'; } })()} 
                  statusLabel={(function(){ try { const obj=JSON.parse(getAspectData('nationality')?.output||'{}'); return obj.category?.verdict||undefined; } catch { return undefined; } })()} 
                  existingFeedback={getExistingFeedback('nationality') as any} 
                  onFeedbackSubmit={(feedback, comment) => handleAspectFeedback('nationality', feedback, comment)} 
                />
                <AspectCard 
                  title="Risk Profile" 
                  icon={<AlertTriangle className="w-4 h-4" />} 
                  llmOutput={getAspectData('risk')?.output || ''} 
                  status={(function(){ try { const obj=JSON.parse(getAspectData('risk')?.output||'{}'); const v=obj.category?.verdict; if (v==='strong_match') return 'match'; if (v==='likely_no_match') return 'different'; return 'unclear'; } catch { return 'unclear'; } })()} 
                  statusLabel={(function(){ try { const obj=JSON.parse(getAspectData('risk')?.output||'{}'); return obj.category?.verdict||undefined; } catch { return undefined; } })()} 
                  existingFeedback={getExistingFeedback('risk') as any} 
                  onFeedbackSubmit={(feedback, comment) => handleAspectFeedback('risk', feedback, comment)} 
                />
              </div>
              
              {/* Save Feedback Button */}
              {Object.keys(pendingFeedbacks).length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        You have {Object.keys(pendingFeedbacks).length} unsaved feedback(s)
                      </p>
                      <p className="text-xs text-blue-700">
                        Aspects: {Object.keys(pendingFeedbacks).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={handleSaveAllFeedbacks}
                      disabled={savingFeedback}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <BookmarkCheck className="w-4 h-4 mr-2" />
                      {savingFeedback ? 'Saving...' : 'Save Feedback'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h2 className="text-lg font-semibold mb-4">Final Verdict</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                  <select 
                    value={finalVerdict || ''} 
                    onChange={(e) => setFinalVerdict(e.target.value as FinalVerdict)} 
                    disabled={!isEditing}
                    className={`w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 ${!isEditing ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">Select verdict...</option>
                    <option value="false_positive">False Positive</option>
                    <option value="true_match">True Match</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                  <textarea 
                    value={comments} 
                    onChange={(e) => setComments(e.target.value)} 
                    placeholder="Add your analysis and reasoning..." 
                    disabled={!isEditing}
                    className={`w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 ${!isEditing ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={4} 
                  />
                </div>
                <div className="flex space-x-3">
                  {!isEditing ? (
                    <button 
                      onClick={() => setIsEditing(true)} 
                      className="flex items-center px-4 py-2 border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 focus:ring-2 focus:ring-blue-500"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Edit Case
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={handleSaveDraft} 
                        disabled={submitting || !isEditing}
                        className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {submitting ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button 
                        onClick={handleSubmitCase} 
                        disabled={!finalVerdict || submitting || !isEditing} 
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {submitting ? 'Submitting...' : 'Submit Case'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseReview;