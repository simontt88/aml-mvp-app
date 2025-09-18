import React, { useMemo, useRef, useState } from 'react';

type SectionKey =
  | 'Key Data'
  | 'Further Information'
  | 'Aliases'
  | 'Keywords'
  | 'Connections/Relationships'
  | 'Sources'
  | 'Hit Category';

interface WorldCheckRecordViewerProps {
  structuredRecord: string;
  className?: string;
}

interface CitationMatch {
  start: number;
  end: number;
  text: string;
}

const SECTION_TESTS: Array<{ key: SectionKey; test: (line: string) => boolean }> = [
  { key: 'Key Data', test: (s) => /^\s*Key Data\s*$/i.test(s) },
  { key: 'Further Information', test: (s) => /^\s*Further Information\s*$/i.test(s) },
  { key: 'Aliases', test: (s) => /^\s*Aliases\s*$/i.test(s) },
  { key: 'Keywords', test: (s) => /^\s*Keywords\s*$/i.test(s) },
  { key: 'Connections/Relationships', test: (s) => /^\s*Connections\s*\/?\s*Relationships\s*$/i.test(s) },
  { key: 'Sources', test: (s) => /^\s*Sources\s*$/i.test(s) },
  { key: 'Hit Category', test: (s) => /^\s*Hit Category\s*$/i.test(s) }
];

const WorldCheckRecordViewer: React.FC<WorldCheckRecordViewerProps> = ({ structuredRecord, className = '' }) => {
  const [activeTab, setActiveTab] = useState<SectionKey>('Key Data');
  const [highlightedRanges, setHighlightedRanges] = useState<CitationMatch[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingScrollTo, setPendingScrollTo] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => structuredRecord.split('\n'), [structuredRecord]);

  // Map logical item index (1-based for '1) Name.fullName') to actual physical line index (1-based)
  const logicalToPhysical: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {};
    let counter = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*\d+\)\s+/u.exec(lines[i]);
      if (m) {
        counter += 1;
        map[counter] = i + 1;
      }
    }
    return map;
  }, [lines]);

  // Determine which section each physical line belongs to
  const lineIndexToSection: Record<number, SectionKey> = useMemo(() => {
    const mapping: Record<number, SectionKey> = {};
    let current: SectionKey = 'Key Data';
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      const match = SECTION_TESTS.find((s) => s.test(raw));
      if (match) current = match.key;
      mapping[i + 1] = current; // store as 1-based
    }
    return mapping;
  }, [lines]);

  const availableTabs: SectionKey[] = useMemo(() => {
    const set = new Set<SectionKey>();
    Object.values(lineIndexToSection).forEach((sec) => set.add(sec));
    // Ensure deterministic order based on SECTION_TESTS
    return SECTION_TESTS.map((s) => s.key).filter((k) => set.has(k));
  }, [lineIndexToSection]);

  const getSectionForRange = (startLine: number, endLine: number): SectionKey => {
    const startSection = lineIndexToSection[startLine] || 'Key Data';
    for (let i = startLine; i <= endLine; i++) {
      if ((lineIndexToSection[i] || 'Key Data') !== startSection) return 'Key Data';
    }
    return startSection;
  };

  const highlightLines = (startLine: number, endLine: number) => {
    const newHighlight: CitationMatch = {
      start: startLine,
      end: endLine,
      text: `Lines ${startLine}-${endLine}`
    };

    // Switch to the most appropriate tab
    const targetTab = getSectionForRange(startLine, endLine);
    setActiveTab(targetTab);
    setPendingScrollTo(startLine);

    setHighlightedRanges((prev) => {
      const filtered = prev.filter((h) => !(h.start === startLine && h.end === endLine));
      return [...filtered, newHighlight];
    });

    // Clear after a short delay
    setTimeout(() => {
      setHighlightedRanges((prev) => prev.filter((h) => !(h.start === startLine && h.end === endLine)));
    }, 3000);
  };

  const isLineHighlighted = (zeroBasedIndex: number): boolean => {
    const oneBased = zeroBasedIndex + 1;
    return highlightedRanges.some((range) => oneBased >= range.start && oneBased <= range.end);
  };

  // Handle citation events dispatched by analysis components
  React.useEffect(() => {
    const handleCitationClick = (event: Event) => {
      const detail = (event as CustomEvent).detail as { startLine: number; endLine: number };
      let { startLine, endLine } = detail;
      if (logicalToPhysical[startLine] && logicalToPhysical[endLine]) {
        startLine = logicalToPhysical[startLine];
        endLine = logicalToPhysical[endLine];
      }
      highlightLines(startLine, endLine);
    };

    window.addEventListener('citationClick', handleCitationClick as EventListener);
    return () => window.removeEventListener('citationClick', handleCitationClick as EventListener);
  }, [logicalToPhysical]);

  // Scroll to a line after the tab changes and the DOM updates
  React.useEffect(() => {
    if (pendingScrollTo == null) return;
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLDivElement>(`[data-line='${pendingScrollTo}']`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScrollTo(null);
    }
  }, [activeTab, pendingScrollTo]);

  const displayLine = (line: string): string => {
    // Hide leading logical numbers like "12) " for presentation only
    return line.replace(/^\s*\d+\)\s+/u, '');
  };

  const splitKeyValue = (text: string): { key: string; value: string } => {
    const clean = displayLine(text).trim();
    const idx = clean.indexOf(':');
    if (idx === -1) return { key: '', value: clean };
    const key = clean.slice(0, idx).trim();
    const value = clean.slice(idx + 1).trim();
    return { key, value };
  };

  const visibleLineIndices: number[] = useMemo(() => {
    // Only lines for the active tab, excluding the header line (which equals the tab name)
    return lines
      .map((_, idx) => idx)
      .filter((idx) => lineIndexToSection[idx + 1] === activeTab)
      .filter((idx) => !SECTION_TESTS.find((s) => s.key === activeTab && s.test(lines[idx].trim())));
  }, [lines, lineIndexToSection, activeTab]);

  const matchesQuery = (text: string): boolean =>
    query.trim() === '' || text.toLowerCase().includes(query.trim().toLowerCase());

  const renderHighlightedText = (text: string): React.ReactNode => {
    if (!query) return text;
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return text;
    const before = text.slice(0, i);
    const mid = text.slice(i, i + query.length);
    const after = text.slice(i + query.length);
    return (
      <>
        {before}
        <mark className="bg-yellow-200 text-gray-900 rounded px-0.5">{mid}</mark>
        {after}
      </>
    );
  };

  return (
    <div className={`bg-white border rounded-lg p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">World-Check Hit Record</h4>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search record…"
            className="text-xs px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
          {highlightedRanges.length > 0 && (
            <div className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
              {highlightedRanges.map((r) => r.text).join(', ')}
            </div>
          )}
          <button
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
            onClick={() => setShowRaw((v) => !v)}
            title="Toggle raw view"
          >
            {showRaw ? 'Hide raw' : 'Show raw'}
          </button>
        </div>
      </div>

      {/* Segmented tabs */}
      <div className="inline-flex flex-wrap gap-2 mb-3">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs px-3 py-1 rounded-full transition-colors border ${
              activeTab === tab
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Structured Record (clean view) */}
      {!showRaw && (
        <div ref={containerRef} className="border rounded p-3 max-h-96 overflow-y-auto font-sans text-sm leading-6">
          <div className="grid grid-cols-1 gap-2">
            {visibleLineIndices.map((index) => {
              const { key, value } = splitKeyValue(lines[index]);
              if (!matchesQuery(`${key} ${value}`)) return null;
              return (
                <div
                  key={index}
                  data-line={index + 1}
                  className={`rounded px-2 py-1 transition-colors ${
                    isLineHighlighted(index) ? 'bg-yellow-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="grid grid-cols-12 gap-3 items-start">
                    <div className="col-span-12 md:col-span-4 text-[11px] uppercase tracking-wide text-gray-500">
                      {key || '—'}
                    </div>
                    <div className={`col-span-12 md:col-span-8 text-gray-900 ${isLineHighlighted(index) ? 'font-medium' : ''}`}>
                      {renderHighlightedText(value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw fallback (original with visible line numbers) */}
      {showRaw && (
        <div className="border rounded p-3 max-h-96 overflow-y-auto font-mono text-xs">
          {lines.map((line, index) => (
            <div
              key={index}
              data-line={index + 1}
              className={`py-1 px-2 rounded transition-colors duration-300 ${
                isLineHighlighted(index) ? 'bg-yellow-100' : 'hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400 mr-3 select-none">{(index + 1).toString().padStart(2, '0')}</span>
              <span className={isLineHighlighted(index) ? 'font-medium' : ''}>{line}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 text-xs text-gray-500">Click citations in analysis to highlight relevant lines</div>
    </div>
  );
};

export default WorldCheckRecordViewer;


