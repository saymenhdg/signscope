import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Search, SendHorizontal } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { TeacherMessageThread, TeacherMessagesInbox } from '../lib/types'
import { cn } from '../lib/utils'

export function TeacherMessagesPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const requestedThreadId = Number(searchParams.get('thread') ?? '')

  const { data: inbox, isLoading: inboxLoading, error } = useQuery({
    queryKey: ['teacher-messages-inbox'],
    queryFn: () => apiRequest<TeacherMessagesInbox>('/api/teacher/messages'),
  })

  useEffect(() => {
    if (!inbox?.threads.length) {
      return
    }
    if (Number.isFinite(requestedThreadId) && requestedThreadId > 0) {
      const matchedThread = inbox.threads.find((thread) => thread.thread_id === requestedThreadId)
      if (matchedThread) {
        setActiveThreadId(matchedThread.thread_id)
        return
      }
    }
    if (!activeThreadId) {
      setActiveThreadId(inbox.threads[0].thread_id)
    }
  }, [activeThreadId, inbox?.threads, requestedThreadId])

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ['teacher-message-thread', activeThreadId],
    queryFn: () => apiRequest<TeacherMessageThread>(`/api/teacher/messages/${activeThreadId}`),
    enabled: activeThreadId !== null,
  })

  useEffect(() => {
    if (threadData) {
      void queryClient.invalidateQueries({ queryKey: ['teacher-messages-inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] })
    }
  }, [queryClient, threadData])

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest<TeacherMessageThread>(`/api/teacher/messages/${activeThreadId}`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: async (payload) => {
      setDraft('')
      await queryClient.invalidateQueries({ queryKey: ['teacher-messages-inbox'] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] })
      queryClient.setQueryData(['teacher-message-thread', activeThreadId], payload)
    },
  })

  const activeThread = useMemo(
    () => inbox?.threads.find((thread) => thread.thread_id === activeThreadId) ?? null,
    [activeThreadId, inbox?.threads],
  )

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || activeThreadId === null) {
      return
    }
    sendMutation.mutate(body)
  }

  return (
    <TeacherShell title="Messages" subtitle="Respond to students and keep every booking conversation in one place.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-[#f2c9c6] bg-[#fff1f0] px-4 py-3 text-sm text-[#b2433b]">
          {error instanceof Error ? error.message : 'Failed to load messages.'}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.25fr]">
        <Card className="rounded-[26px] border border-white/70 bg-white p-5 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold text-[#000666]">Inbox</h2>
              <p className="text-sm text-[#6a7083]">Threads started from teacher bookings.</p>
            </div>
            <Badge className="border-0 bg-[#eff2fb] text-[#000666]">{inbox?.unread_count ?? 0} unread</Badge>
          </div>

          <div className="mb-5 flex items-center gap-3 rounded-xl bg-[#f2f4f6] px-4 py-3 text-sm text-[#767683]">
            <Search className="size-4" />
            Search will be added next
          </div>

          <div className="space-y-3">
            {inboxLoading ? (
              Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-[20px]" />)
            ) : inbox?.threads.length ? (
              inbox.threads.map((thread) => (
                <button
                  key={thread.thread_id}
                  onClick={() => {
                    setActiveThreadId(thread.thread_id)
                    setSearchParams({ thread: String(thread.thread_id) })
                  }}
                  className={cn(
                    'w-full rounded-[20px] p-4 text-left ring-1 ring-[#edf0f5] transition-all',
                    activeThreadId === thread.thread_id ? 'bg-[#eff2fb]' : 'bg-[#fbfbfe] hover:bg-[#f5f7fc]',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {thread.student_avatar_url ? (
                      <img src={thread.student_avatar_url} alt={thread.student_name} className="size-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded-full bg-[#e7ebf6] font-['Plus_Jakarta_Sans'] text-sm font-bold text-[#000666]">
                        {thread.student_name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-semibold text-[#191c1e]">{thread.student_name}</p>
                        <span className="text-xs text-[#767683]">{new Date(thread.last_message_at).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-[#6a7083]">{thread.last_message_preview}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Badge className="border-0 bg-[#eef0f4] text-[#55648e]">{thread.booking_count} bookings</Badge>
                        {thread.unread_count > 0 ? (
                          <Badge className="border-0 bg-[#a8eef3] text-[#14696d]">{thread.unread_count} new</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <EmptyMessagesState />
            )}
          </div>
        </Card>

        <Card className="flex min-h-[42rem] flex-col rounded-[26px] border border-white/70 bg-white p-0 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
          {activeThread ? (
            <>
              <div className="border-b border-[#eef0f5] px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold text-[#000666]">{activeThread.student_name}</h2>
                    <p className="mt-1 text-sm text-[#6a7083]">{activeThread.student_email}</p>
                  </div>
                  <Badge className="border-0 bg-[#eff2fb] text-[#000666]">{activeThread.booking_count} bookings</Badge>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                {threadLoading ? (
                  Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-[20px]" />)
                ) : threadData?.messages.length ? (
                  threadData.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn('flex', message.is_own ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[75%] rounded-[22px] px-4 py-3',
                          message.is_own ? 'bg-[#000666] text-white' : 'bg-[#f2f4f6] text-[#191c1e]',
                        )}
                      >
                        <p className="text-sm leading-7">{message.body}</p>
                        <p className={cn('mt-2 text-[11px]', message.is_own ? 'text-white/70' : 'text-[#767683]')}>
                          {message.sender_name} • {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <EmptyMessagesState compact />
                  </div>
                )}
              </div>

              <form onSubmit={handleSend} className="border-t border-[#eef0f5] p-5">
                <div className="flex items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-24 flex-1 rounded-[20px] bg-[#f2f4f6] px-4 py-3 text-sm text-[#191c1e] outline-none transition-all placeholder:text-[#767683] focus:bg-white focus:shadow-[0_8px_24px_-8px_rgba(0,6,102,0.12)]"
                    placeholder="Reply to the student..."
                  />
                  <Button
                    type="submit"
                    className="rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)] px-5 text-white hover:brightness-110"
                    disabled={sendMutation.isPending || draft.trim().length === 0}
                  >
                    <SendHorizontal className="size-4" />
                    {sendMutation.isPending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyMessagesState />
            </div>
          )}
        </Card>
      </div>
    </TeacherShell>
  )
}

function EmptyMessagesState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('rounded-[20px] border border-dashed border-[#dbe0ec] bg-[#fbfbfe] text-center', compact ? 'p-5' : 'p-8')}>
      <MessageSquare className="mx-auto size-8 text-[#000666]" />
      <p className="mt-4 font-['Plus_Jakarta_Sans'] text-xl font-bold text-[#000666]">No conversations yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#64739e]">
        Threads appear automatically when students start booking lessons with you.
      </p>
    </div>
  )
}
