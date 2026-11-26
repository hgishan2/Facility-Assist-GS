import React, { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles, Wand2 } from 'lucide-react';
import {
  applySingleSpellingFix,
  autoCorrectFullText,
  autoCorrectWordBoundary,
  findSpellingIssues,
  isAutoCorrectEnabled,
  setAutoCorrectEnabled,
  SpellingIssue,
} from '../lib/spellChecker';

interface SpellAssistStripProps {
  value: string;
  onChange: (nextValue: string) => void;
  autoCorrect: boolean;
  onToggleAutoCorrect: () => void;
  lastCorrectedNotice: string | null;
  compact?: boolean;
}

const SpellAssistStrip: React.FC<SpellAssistStripProps> = ({
  value,
  onChange,
  autoCorrect,
  onToggleAutoCorrect,
  lastCorrectedNotice,
  compact = false,
}) => {
  const issues = useMemo(() => findSpellingIssues(value), [value]);

  if (issues.length === 0 && !lastCorrectedNotice && compact) {
    return null;
  }

  const handleFixIssue = (issue: SpellingIssue) => {
    onChange(applySingleSpellingFix(value, issue));
  };

  const handleFixAll = () => {
    const res = autoCorrectFullText(value);
    if (res.text !== value) {
      onChange(res.text);
      return;
    }
    // Also apply any remaining top fuzzy suggestions
    let next = value;
    const currentIssues = findSpellingIssues(next);
    // Apply from end to start so indices stay valid
    for (let i = currentIssues.length - 1; i >= 0; i--) {
      next = applySingleSpellingFix(next, currentIssues[i]);
    }
    onChange(next);
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {issues.length > 0 ? (
          <>
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
              <Sparkles className="w-3 h-3 shrink-0" />
              Spelling:
            </span>
            {issues.slice(0, 4).map((iss, idx) => (
              <button
                key={`${iss.startIndex}-${iss.word}-${idx}`}
                type="button"
                onClick={() => handleFixIssue(iss)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
                title={`Replace "${iss.word}" with "${iss.suggestion}"`}
              >
                <span className="line-through opacity-70">{iss.word}</span>
                <span>→</span>
                <span className="font-semibold">{iss.suggestion}</span>
              </button>
            ))}
            {issues.length > 1 && (
              <button
                type="button"
                onClick={handleFixAll}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-300 font-medium hover:bg-brand-100 dark:hover:bg-brand-900/60"
              >
                <Wand2 className="w-2.5 h-2.5" />
                Fix all
              </button>
            )}
          </>
        ) : lastCorrectedNotice ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Check className="w-3 h-3" />
            {lastCorrectedNotice}
          </span>
        ) : null}
      </div>

      {!compact && (
        <button
          type="button"
          onClick={onToggleAutoCorrect}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors shrink-0 ${
            autoCorrect
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}
          title="Toggle automatic spelling & acronym correction"
        >
          Auto-correct: {autoCorrect ? 'ON' : 'OFF'}
        </button>
      )}
    </div>
  );
};

function useAutoCorrectState() {
  const [autoCorrect, setAutoCorrect] = useState<boolean>(() => isAutoCorrectEnabled());
  const [lastCorrectedNotice, setLastCorrectedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!lastCorrectedNotice) return;
    const t = setTimeout(() => setLastCorrectedNotice(null), 2600);
    return () => clearTimeout(t);
  }, [lastCorrectedNotice]);

  const toggleAutoCorrect = () => {
    const next = !autoCorrect;
    setAutoCorrect(next);
    setAutoCorrectEnabled(next);
  };

  return { autoCorrect, toggleAutoCorrect, lastCorrectedNotice, setLastCorrectedNotice };
}

interface SpellCheckInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (val: string) => void;
  showToggle?: boolean;
}

export const SpellCheckInput: React.FC<SpellCheckInputProps> = ({
  value,
  onValueChange,
  showToggle = false,
  onBlur,
  ...rest
}) => {
  const { autoCorrect, toggleAutoCorrect, lastCorrectedNotice, setLastCorrectedNotice } =
    useAutoCorrectState();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!autoCorrect) {
      onValueChange(raw);
      return;
    }
    const res = autoCorrectWordBoundary(raw, value);
    if (res.correctedWord) {
      setLastCorrectedNotice(`Auto-corrected "${res.correctedWord.from}" → "${res.correctedWord.to}"`);
    }
    onValueChange(res.text);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (autoCorrect && value.trim()) {
      const res = autoCorrectFullText(value);
      if (res.text !== value) {
        onValueChange(res.text);
        if (res.corrections.length > 0) {
          const last = res.corrections[res.corrections.length - 1];
          setLastCorrectedNotice(`Auto-corrected "${last.from}" → "${last.to}"`);
        }
      }
    }
    onBlur?.(e);
  };

  return (
    <div>
      <input
        {...rest}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
      />
      <SpellAssistStrip
        value={value}
        onChange={onValueChange}
        autoCorrect={autoCorrect}
        onToggleAutoCorrect={toggleAutoCorrect}
        lastCorrectedNotice={lastCorrectedNotice}
        compact={!showToggle}
      />
    </div>
  );
};

interface SpellCheckTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (val: string) => void;
  showToggle?: boolean;
}

export const SpellCheckTextarea: React.FC<SpellCheckTextareaProps> = ({
  value,
  onValueChange,
  showToggle = true,
  onBlur,
  ...rest
}) => {
  const { autoCorrect, toggleAutoCorrect, lastCorrectedNotice, setLastCorrectedNotice } =
    useAutoCorrectState();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    if (!autoCorrect) {
      onValueChange(raw);
      return;
    }
    const res = autoCorrectWordBoundary(raw, value);
    if (res.correctedWord) {
      setLastCorrectedNotice(`Auto-corrected "${res.correctedWord.from}" → "${res.correctedWord.to}"`);
    }
    onValueChange(res.text);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (autoCorrect && value.trim()) {
      const res = autoCorrectFullText(value);
      if (res.text !== value) {
        onValueChange(res.text);
        if (res.corrections.length > 0) {
          setLastCorrectedNotice(
            `Auto-corrected ${res.corrections.length} term(s)`
          );
        }
      }
    }
    onBlur?.(e);
  };

  return (
    <div>
      <textarea
        {...rest}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
      />
      <SpellAssistStrip
        value={value}
        onChange={onValueChange}
        autoCorrect={autoCorrect}
        onToggleAutoCorrect={toggleAutoCorrect}
        lastCorrectedNotice={lastCorrectedNotice}
        compact={!showToggle}
      />
    </div>
  );
};
