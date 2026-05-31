// ── AgentSheet: right-side assistant surface, bridge-driven ──────────────────
import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { X, Bot, Send, Loader2, BookOpen, AlertCircle, Network, MessageSquarePlus } from 'lucide-react'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'
import { useCatalystAgent, useCatalystWorkspace, useCatalystLayout } from '@/catalyst/bridge/hooks'
import type { AgentMessageVM } from '@/catalyst/bridge/viewModels'

const STARTER_PROMPTS = [
  'Find stable oxide semiconductor materials with band gap above 2 eV',
  'Find stable nonmetal nitrides with wide band gap',
  'Explain the current material and its graph neighbors',
  'What properties make a good battery cathode material?',
]

export function AgentSheet() {
  const { messages, isRunning, mode, sendMessage, newChat } = useCatalystAgent()
  const { workspace }                               = useCatalystWorkspace()
  const { activeSheet, closeSheet }                 = useCatalystLayout()

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const isOpen = activeSheet === 'agent'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isRunning])

  if (!isOpen) return null

  function handleSend() {
    const text = input.trim()
    if (!text || isRunning) return
    setInput('')
    sendMessage(text)
  }

  function handleNewChat() {
    if (isRunning) return
    newChat()
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const modeLabel = mode === 'provider_backed' ? 'LLM tool loop' : 'Local fallback'
  const currentContext = workspace?.title

  return (
    <div className="absolute top-0 bottom-0 right-0 z-30 flex flex-col animate-slide-right shadow-sm"
      style={{ width: 400, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center border"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)' }}>
            <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-medium leading-none" style={{ color: 'var(--text-1)' }}>Catalyst Agent</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{modeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleNewChat}
            disabled={isRunning}
            title="New chat"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-3)' }}>
            <MessageSquarePlus className="w-4 h-4" />
          </button>
          <button onClick={closeSheet}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
            style={{ color: 'var(--text-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context pill */}
      {currentContext && (
        <div className="px-4 py-2 flex items-center gap-2 border-b text-[11px]"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
          <Network className="w-3 h-3" style={{ color: 'var(--material)' }} />
          <span style={{ color: 'var(--text-3)' }}>
            Context: <span className="font-mono" style={{ color: 'var(--material)' }}>{currentContext}</span>
          </span>
        </div>
      )}

      {/* Mode warning */}
      {mode === 'deterministic_tool_agent' && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px]"
          style={{ background: 'rgba(240,195,106,0.06)', borderColor: 'rgba(240,195,106,0.2)', color: 'var(--warning)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Local fallback — configure a working LLM key in Settings for the agent loop.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-4">
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center border mx-auto mb-3"
                style={{ background: 'var(--accent-muted)', borderColor: 'rgba(143,188,255,0.2)' }}>
                <Bot className="w-6 h-6" style={{ color: 'var(--accent)', opacity: 0.7 }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Ask the agent</p>
              <p className="text-xs mt-1 max-w-[260px] mx-auto" style={{ color: 'var(--text-3)' }}>
                Screen candidates, explore graph relationships, or ask about materials.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {STARTER_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => setInput(p)}
                  className="w-full text-left px-3 py-2 rounded-xl border text-xs transition hover:bg-[var(--surface-3)]"
                  style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}

        {isRunning && (
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border"
              style={{ background: 'var(--accent-muted)', borderColor: 'rgba(143,188,255,0.2)' }}>
              <Bot className="w-3 h-3" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm border flex items-center gap-2"
              style={{ background: 'var(--surface-3)', borderColor: 'var(--border)' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Processing…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about materials, screen candidates…"
            rows={2}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm resize-none outline-none scrollbar-thin placeholder:text-[var(--text-4)]"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isRunning}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)' }}
          >
            {isRunning
              ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--bg)' }} />
              : <Send className="w-4 h-4" style={{ color: 'var(--bg)' }} />
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AgentMessageVM }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm border"
          style={{ background: 'var(--accent-muted)', borderColor: 'rgba(143,188,255,0.2)', color: 'var(--text-1)' }}>
          {msg.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border"
          style={{ background: 'var(--accent-muted)', borderColor: 'rgba(143,188,255,0.2)' }}>
          <Bot className="w-3 h-3" style={{ color: 'var(--accent)' }} />
        </div>
        {msg.confidence && (
          <span className="text-[10px] font-medium" style={{ color: confidenceColor(msg.confidence) }}>
            {confidenceLabel(msg.confidence)}
          </span>
        )}
      </div>

      <div className={cn(
        'px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm border leading-relaxed',
        msg.role === 'error' ? 'text-[var(--danger)]' : '',
      )}
        style={{ background: 'var(--surface-3)', borderColor: 'var(--border)', color: msg.role === 'error' ? 'var(--danger)' : 'var(--text-1)' }}>
        <MarkdownText text={msg.text} />
      </div>

      {/* Citations */}
      {(msg.citations?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {msg.citations!.map((cite, i) => (
            <a key={i} href={cite.url || '#'} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition hover:bg-[var(--accent-muted)]"
              style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
              <BookOpen className="w-2.5 h-2.5" />{cite.label || `[${i + 1}]`}
            </a>
          ))}
        </div>
      )}

      {/* Candidate count */}
      {(msg.candidateResults?.length ?? 0) > 0 && (
        <p className="text-[10px] px-1" style={{ color: 'var(--success)' }}>
          ✓ {msg.candidateResults!.length} candidate{msg.candidateResults!.length > 1 ? 's' : ''} found
        </p>
      )}
    </div>
  )
}

function MarkdownText({ text }: { text: string }) {
  const source = normalizeMathDelimiters(text)
  if (!source.trim()) return null
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        h1: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>,
        h2: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>,
        h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>,
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-[var(--accent)] underline-offset-2">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 pl-3 text-[var(--text-2)]" style={{ borderColor: 'var(--border)' }}>
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-2 max-w-full overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="min-w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead style={{ background: 'var(--surface-1)' }}>{children}</thead>,
        th: ({ children }) => <th className="border-b px-2 py-1.5 text-left font-semibold" style={{ borderColor: 'var(--border)' }}>{children}</th>,
        td: ({ children }) => <td className="border-t px-2 py-1.5 align-top" style={{ borderColor: 'var(--border-subtle)' }}>{children}</td>,
        pre: ({ children }) => (
          <pre className="my-2 max-w-full overflow-x-auto rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'var(--surface-1)' }}>
            {children}
          </pre>
        ),
        code: ({ className, children }) => {
          const isBlock = Boolean(className)
          if (isBlock) {
            return <code className={cn('font-mono', className)}>{children}</code>
          }
          return <code className="rounded px-1 py-0.5 font-mono text-[0.92em]" style={{ background: 'var(--surface-1)' }}>{children}</code>
        },
      }}
    >
      {source}
    </ReactMarkdown>
  )
}

function normalizeMathDelimiters(text: string) {
  return text
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_match, math) => `$$${math}$$`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_match, math) => `$${math}$`)
}

function confidenceColor(c: string) {
  if (c === 'grounded')          return 'var(--success)'
  if (c === 'partial')           return 'var(--warning)'
  if (c === 'research_required') return 'var(--info)'
  return 'var(--text-3)'
}
function confidenceLabel(c: string) {
  if (c === 'grounded')          return 'Grounded'
  if (c === 'partial')           return 'Partial'
  if (c === 'research_required') return 'Research needed'
  return c
}
