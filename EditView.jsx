import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, collection, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

var TEAL = '#015677'
var LIME = '#F2FF00'
var CHARCOAL = '#1D1D1D'
var WHITE = '#ffffff'
var BG = '#F5F0EC'

var DEPT_ORDER = [
  'Fruit & Veg','Oils & vinegar','Herbs & spices','Dried Goods & Cans & Jars',
  'Tea, Coffee','Spreads','Bread & Cakes','Household & Stationary',
  'Frozen - Savoury','Fish','Meat - Processed','Sauces - Salad','Delicatessen',
  'Meat - BBQ & Unprocessed','Dairy','Toiletries','Asian & exotic',
  'Grains & Legumes','Sauces - BBQ','Pasta & Rice','Bakery Ingredients',
  'Cereals','Chocolate, Biscuits, Sweets, Snacks','Pet Food',
  'Drinks - Wine','Drinks - Beer & Cordial','Frozen - Sweet'
]

var Logo = function (props) {
  var s = props.size || 32
  return (
    <svg width={s} height={s} viewBox="0 0 104 107" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M40.3328 77.6407C60.9374 77.6407 77.6407 60.9374 77.6407 40.3328C77.6407 19.7283 60.9374 3.02496 40.3328 3.02496C19.7282 3.02496 3.0249 19.7283 3.0249 40.3328C3.0249 60.9374 19.7282 77.6407 40.3328 77.6407Z" stroke="white" strokeOpacity="0.5" strokeWidth="6.04993" strokeLinecap="round"/>
      <path d="M26.8199 37.3414C35.2456 42.6681 41.541 52.1868 41.541 52.1868H41.6673C41.6673 52.1868 55.042 28.5202 79.8892 13.9649" stroke="#F2FF00" strokeWidth="6.04993" strokeLinecap="square"/>
    </svg>
  )
}

function gid() { return 'i' + Date.now() + Math.random().toString(36).slice(2, 5) }

export default function EditView({ user }) {
  var [data, setData] = useState({})
  var [loading, setLoading] = useState(true)
  var [search, setSearch] = useState('')
  var [editing, setEditing] = useState(null)
  var [editVal, setEditVal] = useState('')
  var [savedMsg, setSavedMsg] = useState(null)
  var [collapsed, setCollapsed] = useState({})
  var [undoStack, setUndoStack] = useState([])
  var saveTimer = useRef(null)
  var inputRef = useRef(null)
  var searchRef = useRef(null)
  var navigate = useNavigate()

  var LIST_ID = 'food'

  // Load data from Firestore
  useEffect(function () {
    var deptsRef = collection(db, 'users', user.uid, 'lists', LIST_ID, 'departments')
    var unsub = onSnapshot(deptsRef, function (snapshot) {
      var d = {}
      snapshot.forEach(function (docSnap) { d[docSnap.id] = docSnap.data() })
      setData(d)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  // Focus input when editing starts
  useEffect(function () {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  // Ctrl+Z / Cmd+Z
  useEffect(function () {
    var h = function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !editing) {
        e.preventDefault()
        doUndo()
      }
    }
    window.addEventListener('keydown', h)
    return function () { window.removeEventListener('keydown', h) }
  }, [undoStack, editing])

  var flash = function (msg) {
    setSavedMsg(msg)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(function () { setSavedMsg(null) }, 2000)
  }

  var pushUndo = function (snapshot) {
    setUndoStack(function (p) { return p.slice(-30).concat([snapshot]) })
  }

  var doUndo = function () {
    setUndoStack(function (p) {
      if (!p.length) return p
      var last = p[p.length - 1]
      // Restore all depts in snapshot to Firestore
      var batch = writeBatch(db)
      for (var dn in last) {
        var dRef = doc(db, 'users', user.uid, 'lists', LIST_ID, 'departments', dn)
        batch.set(dRef, last[dn])
      }
      batch.commit()
      setData(last)
      flash('Undone ↩')
      return p.slice(0, -1)
    })
  }

  var saveDept = async function (deptName, updatedDept) {
    var dRef = doc(db, 'users', user.uid, 'lists', LIST_ID, 'departments', deptName)
    await setDoc(dRef, updatedDept)
  }

  var allItems = DEPT_ORDER.flatMap(function (d) { return (data[d] || {}).items || [] })
  var totalItems = allItems.length
  var tickedCount = allItems.filter(function (i) { return i.ticked }).length
  var canUndo = undoStack.length > 0

  var startEdit = function (dept, id, field, val) {
    setEditing({ dept: dept, id: id, field: field })
    setEditVal(val)
  }

  var commit = async function () {
    if (!editing) return
    var d = editing.dept, id = editing.id, f = editing.field
    var dept = data[d]
    if (!dept) return
    var updatedItems = (dept.items || []).map(function (i) {
      return i.id === id ? Object.assign({}, i, { [f]: editVal }) : i
    })
    var updatedDept = Object.assign({}, dept, { items: updatedItems })
    pushUndo(data)
    setData(function (prev) { return Object.assign({}, prev, { [d]: updatedDept }) })
    setEditing(null)
    flash('Saved ✓')
    await saveDept(d, updatedDept)
  }

  var toggleTick = async function (deptName, id) {
    var dept = data[deptName]
    if (!dept) return
    var updatedItems = (dept.items || []).map(function (i) {
      return i.id === id ? Object.assign({}, i, { ticked: !i.ticked }) : i
    })
    var updatedDept = Object.assign({}, dept, { items: updatedItems })
    pushUndo(data)
    setData(function (prev) { return Object.assign({}, prev, { [deptName]: updatedDept }) })
    flash('Saved ✓')
    await saveDept(deptName, updatedDept)
  }

  var delItem = async function (deptName, id) {
    var dept = data[deptName]
    if (!dept) return
    var updatedDept = Object.assign({}, dept, { items: (dept.items || []).filter(function (i) { return i.id !== id }) })
    pushUndo(data)
    setData(function (prev) { return Object.assign({}, prev, { [deptName]: updatedDept }) })
    flash('Deleted')
    await saveDept(deptName, updatedDept)
  }

  var addRow = async function (deptName) {
    var dept = data[deptName]
    if (!dept) return
    var ni = { id: gid(), ticked: false, name: '', qty: '', note: '', tags: [], tickedBy: null, tickedAt: null, untickedBy: null, untickedAt: null }
    var updatedDept = Object.assign({}, dept, { items: (dept.items || []).concat([ni]) })
    pushUndo(data)
    setData(function (prev) { return Object.assign({}, prev, { [deptName]: updatedDept }) })
    await saveDept(deptName, updatedDept)
    setTimeout(function () { startEdit(deptName, ni.id, 'name', '') }, 60)
  }

  var untickAll = async function () {
    pushUndo(data)
    var batch = writeBatch(db)
    var newData = {}
    for (var dn in data) {
      var dept = data[dn]
      var updatedItems = (dept.items || []).map(function (i) {
        return i.ticked ? Object.assign({}, i, { ticked: false }) : i
      })
      var updatedDept = Object.assign({}, dept, { items: updatedItems })
      newData[dn] = updatedDept
      var dRef = doc(db, 'users', user.uid, 'lists', LIST_ID, 'departments', dn)
      batch.set(dRef, updatedDept)
    }
    setData(newData)
    await batch.commit()
    flash('All unticked')
  }

  var toggleCollapse = function (dept) {
    setCollapsed(function (p) { return Object.assign({}, p, { [dept]: !p[dept] }) })
  }

  var collapseAll = function () {
    var a = {}
    DEPT_ORDER.forEach(function (d) { a[d] = true })
    setCollapsed(a)
  }

  var expandAll = function () { setCollapsed({}) }
  var allCollapsed = DEPT_ORDER.every(function (d) { return collapsed[d] })

  var filterItems = function (items) {
    if (!search) return items
    var q = search.toLowerCase()
    return items.filter(function (i) {
      return i.name.toLowerCase().indexOf(q) >= 0 || (i.note && i.note.toLowerCase().indexOf(q) >= 0)
    })
  }

  var Cell = function (props) {
    var dept = props.dept, item = props.item, field = props.field, ph = props.ph, mono = props.mono
    var isEd = editing && editing.dept === dept && editing.id === item.id && editing.field === field
    var val = item[field] || ''
    if (isEd) {
      return (
        <input ref={inputRef} value={editVal}
          onChange={function (e) { setEditVal(e.target.value) }}
          onBlur={commit}
          onKeyDown={function (e) {
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit() }
            if (e.key === 'Escape') setEditing(null)
          }}
          style={{ width: '100%', border: 'none', borderBottom: '2px solid ' + TEAL, background: TEAL + '0b', padding: '4px 8px', fontSize: 13, color: CHARCOAL, fontFamily: mono ? "'Open Sans Condensed',sans-serif" : "'Open Sans',sans-serif", fontWeight: mono ? 700 : 400, outline: 'none', borderRadius: '4px 4px 0 0' }}
        />
      )
    }
    return (
      <div onClick={function () { startEdit(dept, item.id, field, val) }}
        style={{ padding: '4px 8px', fontSize: 13, color: val ? CHARCOAL : '#ccc', fontFamily: mono ? "'Open Sans Condensed',sans-serif" : "'Open Sans',sans-serif", fontWeight: mono ? 700 : 400, cursor: 'text', minHeight: 28, display: 'flex', alignItems: 'center', borderRadius: 4 }}
        onMouseEnter={function (e) { e.currentTarget.style.background = TEAL + '0d' }}
        onMouseLeave={function (e) { e.currentTarget.style.background = 'transparent' }}
      >
        {val || <span style={{ color: '#ddd', fontStyle: 'italic', fontSize: 11, fontWeight: 400 }}>{ph}</span>}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ background: TEAL, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Logo size={60} />
        <div style={{ color: 'rgba(255,255,255,0.7)', fontFamily: "'Open Sans',sans-serif", fontSize: 14 }}>Loading list…</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Open Sans',sans-serif", background: BG, minHeight: '100vh', color: CHARCOAL }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Open+Sans+Condensed:wght@700&family=Lora:wght@400;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}input{font-family:inherit;outline:none}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#01567744;border-radius:3px}"}</style>

      {/* TOP BAR */}
      <div style={{ background: TEAL, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10, height: 52, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 14px rgba(1,86,119,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Logo size={26} />
          <span style={{ fontFamily: "'Lora',serif", fontSize: 15, fontWeight: 600, color: WHITE }}>TickLists</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16, margin: '0 2px' }}>/</span>
          <span style={{ fontFamily: "'Open Sans Condensed',sans-serif", fontSize: 14, fontWeight: 700, color: LIME }}>Edit: Food</span>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.13)', borderRadius: 20, padding: '3px 12px', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: LIME, fontWeight: 700, fontFamily: "'Open Sans Condensed',sans-serif" }}>{tickedCount}/{totalItems}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>ticked</span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: savedMsg ? LIME : 'rgba(255,255,255,0.22)', minWidth: 72, transition: 'color 0.2s' }}>
          {savedMsg || '● live'}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={allCollapsed ? expandAll : collapseAll}
          style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '4px 13px', fontSize: 12, color: WHITE, cursor: 'pointer', background: 'rgba(255,255,255,0.1)', fontWeight: 600, whiteSpace: 'nowrap' }}
          onMouseEnter={function (e) { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={function (e) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
        >{allCollapsed ? '↕ Expand all' : '↕ Collapse all'}</button>

        <button onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z / Cmd+Z)"
          style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid rgba(255,255,255,' + (canUndo ? '0.22' : '0.08') + ')', borderRadius: 20, padding: '4px 13px', fontSize: 12, color: canUndo ? WHITE : 'rgba(255,255,255,0.28)', cursor: canUndo ? 'pointer' : 'default', background: canUndo ? 'rgba(255,255,255,0.12)' : 'transparent', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none"><path d="M3 7h12a6 6 0 010 12H9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 7l4-4M3 7l4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          Undo{canUndo ? ' (' + undoStack.length + ')' : ''}
        </button>

        <button onClick={untickAll}
          style={{ border: '1px solid rgba(255,255,255,0.22)', borderRadius: 20, padding: '4px 13px', fontSize: 12, color: WHITE, cursor: 'pointer', background: 'rgba(255,255,255,0.12)', fontWeight: 600, whiteSpace: 'nowrap' }}
          onMouseEnter={function (e) { e.currentTarget.style.background = 'rgba(255,255,255,0.22)' }}
          onMouseLeave={function (e) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
        >Untick all</button>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width={13} height={13} viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input ref={searchRef} placeholder="Search all items…" value={search}
            onChange={function (e) { setSearch(e.target.value) }}
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 20, padding: '4px 28px 4px 28px', fontSize: 12, color: WHITE, width: 190 }}
          />
          {search && (
            <button onClick={function () { setSearch(''); if (searchRef.current) searchRef.current.focus() }}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', fontSize: 17, lineHeight: 1, padding: 2, display: 'flex', alignItems: 'center' }}
            >×</button>
          )}
        </div>

        <button onClick={function () { navigate('/') }}
          style={{ background: LIME, borderRadius: 20, padding: '4px 14px', fontSize: 12, color: CHARCOAL, border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: "'Open Sans Condensed',sans-serif", whiteSpace: 'nowrap', flexShrink: 0 }}>← App</button>
      </div>

      {/* COLUMN HEADERS */}
      <div style={{ background: WHITE, borderBottom: '2px solid #ddd', position: 'sticky', top: 52, zIndex: 90, display: 'flex', alignItems: 'center', padding: '0 20px', height: 32 }}>
        <div style={{ width: 240, flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Department</div>
        <div style={{ width: 46, flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Tick</div>
        <div style={{ flex: 2, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Item Name</div>
        <div style={{ width: 90, flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Qty</div>
        <div style={{ flex: 2, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Note</div>
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      {/* DEPARTMENTS */}
      <div style={{ paddingBottom: 52 }}>
        {DEPT_ORDER.map(function (dn) {
          var deptData = data[dn]
          var deptItems = deptData ? (deptData.items || []) : []
          var filtered = filterItems(deptItems)
          var col = collapsed[dn]
          var dticked = deptItems.filter(function (i) { return i.ticked }).length
          if (search && filtered.length === 0) return null

          return (
            <div key={dn}>
              <div onClick={function () { toggleCollapse(dn) }}
                style={{ display: 'flex', alignItems: 'center', padding: '0 20px', height: 34, cursor: 'pointer', borderBottom: '1px solid #ddd', background: BG, userSelect: 'none', position: 'sticky', top: 84, zIndex: 80 }}>
                <div style={{ width: 240, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: TEAL, fontSize: 11, fontWeight: 700, display: 'inline-block', transition: 'transform 0.18s', transform: col ? 'rotate(0deg)' : 'rotate(90deg)' }}>❯</span>
                  <span style={{ fontFamily: "'Lora',serif", fontWeight: 600, fontSize: 13, color: CHARCOAL }}>{dn}</span>
                  <span style={{ fontSize: 11, color: '#bbb' }}>{dticked}/{deptItems.length}</span>
                </div>
                <div style={{ flex: 1 }} />
                {!col && (
                  <button onClick={function (e) { e.stopPropagation(); addRow(dn) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: TEAL, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}
                    onMouseEnter={function (e) { e.currentTarget.style.background = TEAL + '14' }}
                    onMouseLeave={function (e) { e.currentTarget.style.background = 'none' }}
                  >+ Add row</button>
                )}
              </div>

              {!col && filtered.map(function (item, ri) {
                var odd = ri % 2 === 1
                return (
                  <div key={item.id}
                    style={{ display: 'flex', alignItems: 'center', minHeight: 34, background: odd ? '#faf8f5' : WHITE, borderBottom: '1px solid #f0ebe4' }}
                    onMouseEnter={function (e) { e.currentTarget.style.background = TEAL + '08' }}
                    onMouseLeave={function (e) { e.currentTarget.style.background = odd ? '#faf8f5' : WHITE }}
                  >
                    <div style={{ width: 240, flexShrink: 0 }} />
                    <div style={{ width: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button onClick={function () { toggleTick(dn, item.id) }}
                        style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid ' + (item.ticked ? TEAL : '#c8d5de'), background: item.ticked ? TEAL : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                        {item.ticked && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L19 7" /></svg>}
                      </button>
                    </div>
                    <div style={{ flex: 2, minWidth: 0 }}><Cell dept={dn} item={item} field="name" ph="Item name…" mono={true} /></div>
                    <div style={{ width: 90, flexShrink: 0 }}><Cell dept={dn} item={item} field="qty" ph="—" mono={false} /></div>
                    <div style={{ flex: 2, minWidth: 0 }}><Cell dept={dn} item={item} field="note" ph="Add note…" mono={false} /></div>
                    <div style={{ width: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button onClick={function () { delItem(dn, item.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 17, lineHeight: 1, padding: 4, borderRadius: 4, transition: 'color 0.12s' }}
                        onMouseEnter={function (e) { e.currentTarget.style.color = '#ef4444' }}
                        onMouseLeave={function (e) { e.currentTarget.style.color = '#ddd' }}
                        title="Delete item"
                      >×</button>
                    </div>
                  </div>
                )
              })}

              {!col && filtered.length === 0 && !search && (
                <div style={{ padding: '8px 0 8px 286px', fontSize: 12, color: '#ccc', fontStyle: 'italic', background: WHITE, borderBottom: '1px solid #f0ebe4' }}>
                  No items — <button onClick={function () { addRow(dn) }} style={{ background: 'none', border: 'none', color: TEAL, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>add one</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* BOTTOM STATUS */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: CHARCOAL, padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 100 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {totalItems} items · {DEPT_ORDER.length} departments · Click any cell to edit · Every change saves instantly
        </span>
        <div style={{ flex: 1 }} />
        {canUndo && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{undoStack.length} change{undoStack.length !== 1 ? 's' : ''} undoable · Ctrl+Z</span>}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>TickLists Edit View · {user.email}</span>
      </div>
    </div>
  )
}
