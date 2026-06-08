import { useState, useEffect, useRef, useMemo } from 'react'
import { Avatar, Badge } from '@/components/ui'
import { leadScore } from '@/lib/helpers'
import { STATUS } from '@/lib/constants'

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',            icon: '🏠', hint: 'Overview & stats' },
  { id: 'leads',      label: 'Leads',                icon: '👥', hint: 'All leads list' },
  { id: 'pipeline',   label: 'Pipeline',             icon: '📊', hint: 'Kanban board' },
  { id: 'analytics',  label: 'Analytics',            icon: '📈', hint: 'Conversion & performance' },
  { id: 'calendar',   label: 'Calendar',             icon: '📅', hint: 'Events & follow-ups' },
  { id: 'bulk_sms',   label: 'Bulk SMS',             icon: '📱', hint: 'Send mass SMS campaigns' },
  { id: 'reports',    label: 'Reports & Exports',    icon: '📋', hint: 'CSV downloads' },
  { id: 'import',     label: 'Import Leads (CSV)',   icon: '📂', hint: 'Bulk import from file' },
  { id: 'targets',    label: 'Targets & Commission', icon: '🎯', hint: 'Marketer goals' },
  { id: 'add',        label: 'Add New Lead',         icon: '➕', hint: 'Create a lead manually' },
  { id: 'staff',      label: 'Staff Management',     icon: '👤', hint: 'Add or edit staff' },
  { id: 'courses',    label: 'Course Management',    icon: '📚', hint: 'Manage courses' },
  { id: 'finance',    label: 'Finance Portal',       icon: '💰', hint: 'Payments & revenue' },
  { id: 'admission',  label: 'Admissions',           icon: '🎓', hint: 'Letters & registration' },
  { id: 'integrations',label: 'Integrations',        icon: '🔗', hint: 'Facebook, Paystack setup' },
  { id: 'classes',    label: 'Classes & Cohorts',    icon: '🏫', hint: 'Cohort management' },
]

export default function CommandPalette({ leads, staff, courses, nav, onClose }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return NAV_ITEMS.slice(0, 7).map(p => ({ ...p, _type: 'page' }))

    const pages = NAV_ITEMS
      .filter(p => p.label.toLowerCase().includes(q) || p.hint.toLowerCase().includes(q))
      .slice(0, 4)
      .map(p => ({ ...p, _type: 'page' }))

    const matchLeads = leads
      .filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.course_interest?.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map(l => ({ ...l, _type: 'lead' }))

    const matchStaff = staff
      .filter(s => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(s => ({ ...s, _type: 'staff' }))

    return [...matchLeads, ...matchStaff, ...pages].slice(0, 10)
  }, [query, leads, staff])

  useEffect(() => { setCursor(0) }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor]
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const select = (item) => {
    if (item._type === 'lead')  { nav('leads', item); onClose() }
    else if (item._type === 'staff') { nav('staff'); onClose() }
    else { nav(item.id); onClose() }
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) select(results[cursor])
    if (e.key === 'Escape') onClose()
  }

  const highlight = (text) => {
    if (!query.trim()) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-100 text-yellow-900 rounded">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
        style={{ marginTop: '8vh' }}
      >
        {/* Search input */}
        <div className="flex items-center px-4 gap-2 border-b border-slate-100">
          <svg width="18" height="18" className="text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search leads, pages, staff…"
            className="flex-1 h-14 text-[15px] text-slate-900 outline-none placeholder-slate-300 bg-transparent"
          />
          <kbd className="text-[10px] text-slate-300 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '360px' }}>
          {query === '' && (
            <div className="px-4 pt-3 pb-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Navigation</div>
            </div>
          )}
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-2xl mb-2">🔍</div>
              <div className="text-sm text-slate-400">No results for "{query}"</div>
            </div>
          ) : (
            results.map((item, i) => (
              <button
                key={`${item._type}-${item.id || i}`}
                onClick={() => select(item)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition border-l-2
                  ${i === cursor
                    ? 'bg-blue-50 border-blue-500'
                    : 'border-transparent hover:bg-slate-50'}`}
              >
                {/* Lead result */}
                {item._type === 'lead' && (
                  <>
                    <Avatar name={item.name} size={32}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{highlight(item.name)}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {item.phone && highlight(item.phone)}
                        {item.phone && item.email && ' · '}
                        {item.email && highlight(item.email)}
                        {item.course_interest && ` · ${item.course_interest}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge status={item.status}/>
                      <span className="text-[9px] text-slate-300">Lead</span>
                    </div>
                  </>
                )}

                {/* Staff result */}
                {item._type === 'staff' && (
                  <>
                    <Avatar name={item.name} size={32}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{highlight(item.name)}</div>
                      <div className="text-[11px] text-slate-400">{item.email || item.phone || '—'}</div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                      {item.role}
                    </span>
                  </>
                )}

                {/* Page result */}
                {item._type === 'page' && (
                  <>
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-lg shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{highlight(item.label)}</div>
                      <div className="text-[11px] text-slate-400">{item.hint}</div>
                    </div>
                    {i === cursor && (
                      <svg width="14" height="14" className="text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    )}
                  </>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-5 text-[10px] text-slate-300">
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">↵</kbd> select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
