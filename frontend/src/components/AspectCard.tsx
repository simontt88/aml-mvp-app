import React, { useState } from 'react';
import { Check, X, Minus, MessageSquare } from 'lucide-react';
import { FeedbackType, AspectFeedback } from '../types';

interface AspectCardProps {
  title: string;
  icon: React.ReactNode;
  llmOutput: string;
  status: 'match' | 'different' | 'unclear';
  statusLabel?: string;
  existingFeedback?: AspectFeedback;
  onFeedbackSubmit: (feedback: FeedbackType, comment?: string) => void;
}

const AspectCard: React.FC<AspectCardProps> = ({
  title,
  icon,
  llmOutput,
  status,
  statusLabel,
  existingFeedback,
  onFeedbackSubmit
}) => {
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackType | undefined>(
    existingFeedback?.operator_feedback
  );
  const [comment, setComment] = useState(existingFeedback?.operator_comment || '');
  const [showComment, setShowComment] = useState(false);

  React.useEffect(() => {
    setSelectedFeedback(existingFeedback?.operator_feedback);
  }, [existingFeedback?.operator_feedback]);

  const statusConfig = {
    match: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', label: 'Match' },
    different: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', label: 'Different' },
    unclear: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', label: 'Unclear' }
  };

  const config = statusConfig[status];

  const handleFeedbackClick = (feedback: FeedbackType) => {
    setSelectedFeedback(feedback);
    onFeedbackSubmit(feedback, comment);
  };

  const handleCommentSubmit = () => {
    if (selectedFeedback) {
      onFeedbackSubmit(selectedFeedback, comment);
      setShowComment(false);
    }
  };

  const parseAndRender = (raw: string) => {
    // Try to parse JSON-like content, fallback to plain text with citations
    try {
      const obj = JSON.parse(raw);
      const reasoning: string = obj.reasoning || obj.explanation || raw;
      const claims: Array<{ statement: string; citations?: string[] }> = obj.claims || [];
      return (
        <div className="space-y-2">
          <div>{reasoning}</div>
          {claims.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {claims.map((c, idx) => (
                <li key={idx}>
                  {c.statement}
                  {c.citations?.map((cit, i) => {
                    const m = /record:(\d+):(\d+)/.exec(cit);
                    if (!m) return null;
                    const startLine = parseInt(m[1]);
                    const endLine = parseInt(m[2]);
                    return (
                      <button
                        key={i}
                        className="ml-2 inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        onClick={() => {
                          const event = new CustomEvent('citationClick', { detail: { startLine, endLine } });
                          window.dispatchEvent(event);
                        }}
                      >
                        lines {startLine}-{endLine}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    } catch {
      // Fallback: render with inline citation buttons
      const citationRegex = /record:(\d+):(\d+)/g;
      const parts: (string | JSX.Element)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = citationRegex.exec(raw)) !== null) {
        if (match.index > lastIndex) parts.push(raw.slice(lastIndex, match.index));
        const startLine = parseInt(match[1]);
        const endLine = parseInt(match[2]);
        parts.push(
          <button
            key={match.index}
            className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            onClick={() => {
              const event = new CustomEvent('citationClick', { detail: { startLine, endLine } });
              window.dispatchEvent(event);
            }}
          >
            lines {startLine}-{endLine}
          </button>
        );
        lastIndex = citationRegex.lastIndex;
      }
      if (lastIndex < raw.length) parts.push(raw.slice(lastIndex));
      return parts;
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${config.bg} ${config.border}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {icon}
          <h3 className="font-medium text-gray-900">{title}</h3>
          <span className={`px-2 py-1 text-xs font-medium rounded ${config.bg} ${config.text}`}>
            {statusLabel || config.label}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleFeedbackClick('agree')}
            className={`p-2 rounded-md transition-colors ${
              selectedFeedback === 'agree'
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
            title="Agree with analysis"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFeedbackClick('disagree')}
            className={`p-2 rounded-md transition-colors ${
              selectedFeedback === 'disagree'
                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
            title="Disagree with analysis"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFeedbackClick('not_related')}
            className={`p-2 rounded-md transition-colors ${
              selectedFeedback === 'not_related'
                ? 'bg-gray-100 text-gray-700 border-2 border-gray-300'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
            title="Not related/applicable"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowComment(!showComment)}
            className={`p-2 rounded-md transition-colors ${
              showComment || comment
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
            title="Add comment"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm text-gray-700 leading-relaxed">{parseAndRender(llmOutput)}</div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3" />
          {selectedFeedback && (
            <span className="text-green-600 font-medium">Feedback: {selectedFeedback.replace('_', ' ')}</span>
          )}
        </div>

        {showComment && (
          <div className="mt-3 space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add your comment about this analysis..."
              className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowComment(false)} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleCommentSubmit} className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700">
                Save Comment
              </button>
            </div>
          </div>
        )}

        {comment && !showComment && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
            <strong>Your comment:</strong> {comment}
          </div>
        )}
      </div>
    </div>
  );
};

export default AspectCard;