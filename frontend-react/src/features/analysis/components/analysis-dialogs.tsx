import { useAnalysis } from './analysis-provider'
import { RecordDetailModal } from './record-detail-modal'

export function AnalysisDialogs() {
  const {
    open,
    setOpen,
    currentRow,
    setCurrentRow,
    audioUrl,
    audioLoading,
  } = useAnalysis()

  return (
    <>
      {/* 录音详情弹窗 */}
      <RecordDetailModal
        open={open === 'detail'}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpen(null)
            setTimeout(() => {
              setCurrentRow(null)
            }, 300)
          }
        }}
        record={currentRow}
        audioUrl={audioUrl}
        audioLoading={audioLoading}
      />
    </>
  )
}
