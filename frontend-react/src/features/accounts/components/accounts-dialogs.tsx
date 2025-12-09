import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteAccount } from '../api'
import { AccountsMutateDrawer } from './accounts-mutate-drawer'
import { useAccountsContext } from './accounts-provider'

export function AccountsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useAccountsContext()
  const deleteAccount = useDeleteAccount()

  const handleDelete = async () => {
    if (!currentRow) return

    try {
      await deleteAccount.mutateAsync(currentRow.id)
      toast.success('账号删除成功')
      setOpen(null)
      setTimeout(() => {
        setCurrentRow(null)
      }, 500)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  return (
    <>
      <AccountsMutateDrawer
        key='account-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      {currentRow && (
        <>
          <AccountsMutateDrawer
            key={`account-update-${currentRow.id}`}
            open={open === 'update'}
            onOpenChange={() => {
              setOpen('update')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />

          <ConfirmDialog
            key='account-delete'
            destructive
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            handleConfirm={handleDelete}
            isLoading={deleteAccount.isPending}
            className='max-w-md'
            title={`删除账号: ${currentRow.phone} ?`}
            desc={
              <>
                您即将删除账号 <strong>{currentRow.phone}</strong>（
                {currentRow.company_name}）。
                <br />
                此操作无法撤销。
              </>
            }
            confirmText='删除'
          />
        </>
      )}
    </>
  )
}
