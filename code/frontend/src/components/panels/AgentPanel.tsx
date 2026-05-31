// @ts-nocheck
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, Send, X, Zap, BookOpen, Network, BarChart2, Download,
  FlaskConical, ChevronRight, Loader2, AlertCircle, CheckCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

const DEMO_PROMPTS = [
  'Find stable oxide semiconductor materials with band gap above 2 eV',
  'Find stable nonmetal nitride materials with a wide band gap',
  'Find magnetic oxide materials that are stable',
  'Explain mp-bkrla',
  'Open mp-ckgno and show why it is connected to nearby materials',
]

const ACTION_ICONS: Record<string, React.ReactNode> = {
  open_material: <Network className="w-3 h-3" />,
  show_candidates: <BarChart2 className="w-3 h-3" />,
  compare_candidates: <BarChart2 className="w-3 h-3" />,
  expand_neighborhood: <Network className="w-3 h-3" />,
  export: <Download className="w-3 h-3" />,
  start_research: <FlaskConical className="w-3 h-3" />,
  inspect_edge: <ChevronRight className="w-3 h-3" />,
}

const CONFIDENCE_STYLE: Record<string, string> = {
  grounded: 'text-status-success',
  partial: 'text-status-warning',
  research_required: 'text-status-info',
}
const CONFIDENCE_LABEL: Record<string, string> = {
  grounded: 'Grounded',
  partial: 'Partial',
  research_required: 'Research needed',
}

export function AgentPanel() {
  const isAgentOpen = useStore((s) => s.isAgentOpen)
  const setAgentOpen = useStore((s) => s.setAgentOpen)
  const chatMessages = useStore((s) => s.chatMessages)
  const agentLoading = useStore((s) => s.agentLoading)
  const sendAgentMessage = useStore((s) => s.sendAgentMessage)
  const executeAgentAction = useStore((s) => s.executeAgentAction)
  const providerStatus = useStore((s) => s.providerStatus)
  const selectedMaterialData = useStore((s) => s.selectedMaterialData)

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const currentMaterial = selectedMaterialData?.summary?.formula_pretty || selectedMaterialData?.material_id

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, agentLoading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || agentLoading) return
    setInput('')
    sendAgentMessage(text)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const isLLMConfigured = providerStatus?.llm_configured === true

  return (
    <AnimatePresence>
      {isAgentOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute top-0 bottom-0 right-0 w-[420px] max-w-[calc(100vw-60px)] bg-surface-1/96 backdrop-blur-xl border-l border-border-default flex flex-col z-40 shadow-2xl"
        >
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-border-default flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-accent" />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary leading-none">Catalyst Agent</div>
                <div className="text-[10px] text-text-tertiary mt-0.5">
                  {isLLMConfigured
                    ? `${providerStatus?.active_provider || 'LLM'} · grounded`
                    : 'Deterministic tool-agent'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setAgentOpen(false)}
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Context indicator */}
          {currentMaterial && (
            <div className="px-4 py-2 flex items-center gap-2 bg-surface-0/50 border-b border-border-subtle text-[11px] text-text-tertiary">
              <Network className="w-3 h-3 text-node-material" />
              <span>Context: <span className="text-node-material font-mono">{currentMaterial}</span></span>
            </div>
          )}

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col gap-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col gap-4">
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-3">
                    <Bot className="w-7 h-7 text-accent/60" />
                  </div>
                  <p className="text-sm text-text-secondary font-medium">Catalyst Agent</p>
                  <p className="text-xs text-text-tertiary mt-1 max-w-[280px] mx-auto">
                    Ask about materials, request candidate screening, or explore graph relationships.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-quaternary px-1">
                    Demo prompts
                  </p>
                  {DEMO_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(prompt) }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-surface-0 hover:bg-surface-2 border border-border-subtle hover:border-border-default text-xs text-text-secondary hover:text-text-primary transition group"
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-accent/50 group-hover:text-accent flex-shrink-0" />
                        <span className="truncate">{prompt}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div key={msg.id} className={cn('flex flex-col gap-1.5', msg.role === 'user' ? 'items-end' : 'items-start')}>
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-accent/20 border border-accent/25 text-sm text-text-primary">
                    {msg.text}
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-md bg-accent/15 border border-accent/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3 text-accent" />
                      </div>
                      {msg.confidence && (
                        <span className={cn('text-[10px] font-medium', CONFIDENCE_STYLE[msg.confidence])}>
                          {CONFIDENCE_LABEL[msg.confidence]}
                        </span>
                      )}
                    </div>

                    <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2 border border-border-default text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-1.5 px-1 flex flex-wrap gap-1">
                        {msg.citations.map((cite, i) => (
                          <a
                            key={i}
                            href={cite.url || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-surface-0 border border-border-default text-accent hover:bg-accent/10 transition"
                          >
                            <BookOpen className="w-2.5 h-2.5" />
                            {cite.label || `[${i + 1}]`}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 px-1 flex flex-wrap gap-1.5">
                        {msg.actions.map((action: any) => (
                          <button
                            key={action.id}
                            onClick={() => executeAgentAction(action)}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-0 border border-border-default text-text-secondary hover:text-text-primary hover:border-accent/30 hover:bg-accent/5 transition"
                          >
                            {ACTION_ICONS[action.type] || <ChevronRight className="w-3 h-3" />}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Candidate count */}
                    {msg.candidateResults && msg.candidateResults.length > 0 && (
                      <div className="mt-1.5 px-1">
                        <span className="text-[10px] text-text-tertiary">
                          <CheckCircle className="w-3 h-3 text-status-success inline mr-1" />
                          {msg.candidateResults.length} candidate{msg.candidateResults.length > 1 ? 's' : ''} found
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading */}
            {agentLoading && (
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-md bg-accent/15 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3 h-3 text-accent" />
                </div>
                <div className="px-3.5 py-3 rounded-2xl rounded-tl-sm bg-surface-2 border border-border-default flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                  <span className="text-xs text-text-tertiary">Processing…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* LLM status warning */}
          {!isLLMConfigured && (
            <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-status-warning/8 border border-status-warning/20 text-[11px] text-status-warning">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Deterministic mode — no LLM key configured. Agent uses grounded tool results only.
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-border-default flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about materials, screen candidates, explore graph…"
                rows={2}
                className="flex-1 bg-surface-0 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-quaternary resize-none focus:outline-none focus:border-accent/50 transition custom-scrollbar"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || agentLoading}
                className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition active:scale-95"
              >
                {agentLoading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
