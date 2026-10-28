/**
 * reconciliation/widgets.tsx - Small, self-contained pieces of reconciliation-view.tsx with no
 * dependency on reconciliationState: the ledger file drop zone and the results table's pagination
 * bar (a thin React wrapper around the shared imperative renderPaginationBar widget).
 */
import { useEffect, useRef, useState } from "react";
import { renderPaginationBar } from "../../utils/utils.ts";
import { reconciliationState } from "../../services/reconciliation.ts";

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const clamped = renderPaginationBar(ref.current, { page, pageSize, totalItems, onPageChange, onPageSizeChange });
    if (clamped !== page) reconciliationState.page = clamped;
  });
  return <div className="pagination-bar" ref={ref} />;
}

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      id="drop-zone"
      className={`drop-zone${dragOver ? " dragover" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <svg className="drop-zone-icon" viewBox="0 0 24 24">
        <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" />
      </svg>
      <div className="drop-zone-text">Déposez le fichier extrait du Grand Livre (.xls, .xlsx) ici</div>
      <div className="drop-zone-desc">ou cliquez pour parcourir vos fichiers</div>
      <input
        type="file"
        id="ledger-file-input"
        ref={inputRef}
        style={{ display: "none" }}
        accept=".xls,.xlsx"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
