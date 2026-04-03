import { useState } from 'react';
import styles from '../styles/Chat.module.css';

export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

interface AgentQuestionProps {
  id: string;
  prompt: string;
  options: QuestionOption[];
  multiSelect: boolean;
  onAnswer: (questionId: string, selectedValues: string[], selectedLabels: string[]) => void;
  answered?: boolean;
  selectedValues?: string[];
}

export default function AgentQuestion({
  id,
  prompt,
  options,
  multiSelect,
  onAnswer,
  answered,
  selectedValues: initialSelected,
}: AgentQuestionProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelected || [])
  );
  const isAnswered = answered || false;

  const handleSelect = (value: string) => {
    if (isAnswered) return;

    if (multiSelect) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return next;
      });
    } else {
      // Single select — immediately answer
      const option = options.find((o) => o.value === value);
      const labels = option ? [option.label] : [value];
      onAnswer(id, [value], labels);
    }
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    const selectedLabels = options
      .filter((o) => selected.has(o.value))
      .map((o) => o.label);
    onAnswer(id, Array.from(selected), selectedLabels);
  };

  return (
    <div className={styles.questionContainer}>
      <div className={styles.questionPrompt}>{prompt}</div>
      <div className={styles.questionOptions}>
        {options.map((opt) => {
          const isSelected = selected.has(opt.value);
          const wasChosen = isAnswered && initialSelected?.includes(opt.value);

          return (
            <button
              key={opt.value}
              className={`${styles.questionOption} ${
                isSelected ? styles.questionOptionSelected : ''
              } ${wasChosen ? styles.questionOptionChosen : ''} ${
                isAnswered ? styles.questionOptionDisabled : ''
              }`}
              onClick={() => handleSelect(opt.value)}
              disabled={isAnswered}
            >
              {multiSelect && (
                <span className={styles.questionCheckbox}>
                  {isSelected ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <polyline points="9 12 11.5 14.5 16 9" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                    </svg>
                  )}
                </span>
              )}
              <span className={styles.questionOptionContent}>
                <span className={styles.questionOptionLabel}>{opt.label}</span>
                {opt.description && (
                  <span className={styles.questionOptionDesc}>{opt.description}</span>
                )}
              </span>
              {!multiSelect && isAnswered && wasChosen && (
                <svg className={styles.questionCheckIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      {multiSelect && !isAnswered && (
        <button
          className={styles.questionConfirmBtn}
          onClick={handleConfirm}
          disabled={selected.size === 0}
        >
          Confirm selection ({selected.size})
        </button>
      )}
    </div>
  );
}
