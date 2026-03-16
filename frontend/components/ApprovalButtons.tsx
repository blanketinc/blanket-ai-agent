import styles from '../styles/Chat.module.css';

interface ApprovalButtonsProps {
  description: string;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  status?: 'pending' | 'approved' | 'rejected';
}

export default function ApprovalButtons({
  description,
  onApprove,
  onReject,
  disabled,
  status,
}: ApprovalButtonsProps) {
  if (status === 'approved') {
    return (
      <div className={styles.approvalContainer}>
        <div className={styles.approvalDescription}>{description}</div>
        <div className={styles.approvalResolved}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Approved
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className={styles.approvalContainer}>
        <div className={styles.approvalDescription}>{description}</div>
        <div className={styles.approvalRejected}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Rejected
        </div>
      </div>
    );
  }

  return (
    <div className={styles.approvalContainer}>
      <div className={styles.approvalDescription}>{description}</div>
      <div className={styles.approvalActions}>
        <button
          className={styles.approveButton}
          onClick={onApprove}
          disabled={disabled}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Approve
        </button>
        <button
          className={styles.rejectButton}
          onClick={onReject}
          disabled={disabled}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Reject
        </button>
      </div>
    </div>
  );
}
