import React from "react";
import { NewActivityModal } from "./NewActivityModal.tsx";
import { TaxOverrideModal } from "./TaxOverrideModal.tsx";
import { FilePreviewModal } from "./FilePreviewModal.tsx";
import { ExcelExportModal } from "./ExcelExportModal.tsx";

export const GlobalModals: React.FC = () => {
  return (
    <>
      <NewActivityModal />
      <TaxOverrideModal />
      <FilePreviewModal />
      <ExcelExportModal />
    </>
  );
};
