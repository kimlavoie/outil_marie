/**
 * HelpIndicatorButton.tsx - The small round "?" button next to a pricing-grid-editor section
 * label, shown hovering a help popup while the pointer is over it. The popup's own markup is
 * owned by whichever step renders it (positioned relative to that step), since only the step
 * knows what to say — this component only owns the "?" trigger.
 */
export function HelpIndicatorButton({ onMouseEnter, onMouseLeave }: { onMouseEnter: () => void; onMouseLeave: () => void }) {
  return (
    <button
      type="button"
      className="btn-help-indicator"
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "var(--primary-light)",
        color: "var(--primary)",
        border: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.7rem",
        fontWeight: "bold",
        cursor: "help",
        padding: 0,
        marginLeft: 6,
        verticalAlign: "middle"
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      ?
    </button>
  );
}
