import styles from '../styles/Chat.module.css';

interface DiffViewProps {
  before: any;
  after: any;
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function computeChanges(before: any, after: any): Array<{ key: string; old: string; new: string }> {
  const changes: Array<{ key: string; old: string; new: string }> = [];
  if (!before || !after) return changes;

  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of allKeys) {
    if (key === '_pending') continue;
    const oldVal = formatValue(before[key]);
    const newVal = formatValue(after[key]);
    if (oldVal !== newVal) {
      changes.push({ key, old: oldVal, new: newVal });
    }
  }
  return changes;
}

export default function DiffView({ before, after }: DiffViewProps) {
  const changes = computeChanges(before, after);

  if (changes.length === 0) {
    return (
      <div className={styles.diffView}>
        <div className={styles.diffHeader}>Changes Preview</div>
        <div className={styles.diffEmpty}>No visible changes detected</div>
      </div>
    );
  }

  return (
    <div className={styles.diffView}>
      <div className={styles.diffHeader}>Changes Preview</div>
      <div className={styles.diffContent}>
        {changes.map((change, i) => (
          <div key={i} className={styles.diffRow}>
            <div className={styles.diffKey}>{change.key}</div>
            <div className={styles.diffOld}>
              <span className={styles.diffLabel}>Before:</span>
              <pre>{change.old}</pre>
            </div>
            <div className={styles.diffNew}>
              <span className={styles.diffLabel}>After:</span>
              <pre>{change.new}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
