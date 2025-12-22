import { useAnalysis } from './analysis-provider'
import { RecordDetailModal } from './record-detail-modal'
import { TranscriptStatsDialog } from './transcript-stats-dialog'

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

      {/* 转写统计弹窗 */}
      <TranscriptStatsDialog
        open={open === 'transcript-stats'}
        onOpenChange={(isOpen) => setOpen(isOpen ? 'transcript-stats' : null)}
      />
    </>
  )
}
