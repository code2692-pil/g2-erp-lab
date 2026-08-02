import { ErpDialog } from "../ErpDialog";

interface RangeValidationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function RangeValidationDialog({ open, onClose }: RangeValidationDialogProps) {
  return (
    <ErpDialog
      dataTestId="range-validation-dialog"
      dismissOnBackdrop={false}
      onClose={onClose}
      open={open}
      title="조회 기간을 확인해 주세요."
      width={420}
      footer={<button className="primary" data-testid="range-validation-confirm" onClick={onClose} type="button">확인</button>}
    >
      <p>시작일은 종료일보다 늦을 수 없습니다.</p>
    </ErpDialog>
  );
}
