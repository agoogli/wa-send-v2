import { useState, useRef, useCallback, useEffect } from "react"
import { io } from "socket.io-client"
import {
  Upload,
  Send,
  FileText,
  Loader2,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  FileDown,
  ChevronDown,
  ChevronUp,
  Trash2,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { LoginForm } from "@/components/LoginForm"
import packageJson from "../package.json"

const API_BASE = "/api"

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "-"
  
  const pad = (n: number) => String(n).padStart(2, "0")
  
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yy = String(d.getFullYear()).slice(-2)
  
  const hh = pad(d.getHours())
  const min = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  
  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`
}

function formatDisplayPhone(phone: string | null | undefined): string {
  if (!phone) return "-"
  const clean = phone.trim()
  if (clean.startsWith("+39")) {
    return clean.slice(3).trim()
  }
  if (clean.startsWith("39") && clean.length > 9) {
    return clean.slice(2).trim()
  }
  return clean
}

interface RigaMessaggio {
  id: number
  testo: string
  nominativo: string
  cellulare: string
  link: string
  codice: string
  idApp: string
  stato: string
  errore?: string | null
  idImportMessaggio: number
  created: string
  inviato?: string | null
}

interface ImportMessaggio {
  id: number
  created: string
  righe: RigaMessaggio[]
}



function StatusBadge({ stato }: { stato: string }) {
  const config: Record<string, { variant: "warning" | "success" | "danger" | "secondary"; icon: typeof Clock; label: string }> = {
    IMPORTATO: {
      variant: "secondary",
      icon: FileDown,
      label: "Importato",
    },
    PENDING: {
      variant: "warning",
      icon: Clock,
      label: "Invio in corso",
    },
    INVIATO: {
      variant: "success",
      icon: CheckCircle2,
      label: "Inviato",
    },
    ERRORE: {
      variant: "danger",
      icon: XCircle,
      label: "Errore",
    },
  }
  const c = config[stato] || config.IMPORTATO
  const Icon = c.icon

  return (
    <Badge variant={c.variant} className="gap-1.5 text-sm py-1 px-2.5 font-medium">
      <Icon className="h-3.5 w-3.5" />
      {c.label}
    </Badge>
  )
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [imports, setImports] = useState<ImportMessaggio[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmSendId, setConfirmSendId] = useState<number | null>(null)

  const [selectedMessageIds, setSelectedMessageIds] = useState<Record<number, boolean>>({})
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Toggle all checkboxes for a specific import
  const handleToggleAll = (impId: number) => {
    const imp = imports.find((i) => i.id === impId)
    if (!imp) return
    const selectable = imp.righe.filter((r) => r.stato === "IMPORTATO")
    const selected = selectable.filter((r) => selectedMessageIds[r.id])
    const allSelected = selectable.length > 0 && selected.length === selectable.length

    setSelectedMessageIds((prev) => {
      const next = { ...prev }
      for (const r of selectable) {
        next[r.id] = !allSelected
      }
      return next
    })
  }

  // Toggle single row checkbox
  const handleToggleRow = (rowId: number) => {
    setSelectedMessageIds((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }))
  }

  // Auto-select all IMPORTATO messages on load or upload
  useEffect(() => {
    setSelectedMessageIds((prev) => {
      const next = { ...prev }
      let changed = false
      imports.forEach((imp) => {
        imp.righe.forEach((riga) => {
          if (riga.stato === "IMPORTATO" && next[riga.id] === undefined) {
            next[riga.id] = true
            changed = true
          }
        })
      })
      return changed ? next : prev
    })
  }, [imports])

  // Verify authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/check`)
        if (res.ok) {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
    }
    checkAuth()
  }, [])



  // Fetch imports al mount
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchImports = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages/imports`)
        if (res.ok) {
          const data: ImportMessaggio[] = await res.json()
          setImports(data)
          if (data.length > 0) {
            setExpandedId(data[0].id)
          }
        } else if (res.status === 401) {
          setIsAuthenticated(false)
        }
      } catch {
        // Backend non disponibile
      }
    }
    fetchImports()
  }, [isAuthenticated])

  // Connect to Socket.io for real-time updates
  useEffect(() => {
    if (!isAuthenticated) return
    const socket = io({
      transports: ["websocket", "polling"],
    })

    socket.on("connect", () => {
      console.log("Connected to WebSocket server")
    })

    socket.on("messageUpdated", (updatedMsg: RigaMessaggio) => {
      setImports((prevImports) =>
        prevImports.map((imp) => {
          if (imp.id === updatedMsg.idImportMessaggio) {
            return {
              ...imp,
              righe: imp.righe.map((r) =>
                r.id === updatedMsg.id ? updatedMsg : r
              ),
            }
          }
          return imp
        })
      )
    })

    return () => {
      socket.disconnect()
    }
  }, [isAuthenticated])

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`${API_BASE}/messages/upload`, {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        // Ricarica la lista per includere il nuovo import
        const listRes = await fetch(`${API_BASE}/messages/imports`)
        if (listRes.ok) {
          const data: ImportMessaggio[] = await listRes.json()
          setImports(data)
          if (data.length > 0) {
            setExpandedId(data[0].id)
          }
        }
      } else if (res.status === 401) {
        setIsAuthenticated(false)
      }
    } catch (err) {
      console.error("Upload fallito:", err)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleSend = useCallback(async (importId: number) => {
    setSending(true)
    const targetImport = imports.find((imp) => imp.id === importId)
    const selectedIds = targetImport
      ? targetImport.righe
          .filter((r) => r.stato === "IMPORTATO" && selectedMessageIds[r.id])
          .map((r) => r.id)
      : []

    try {
      const res = await fetch(`${API_BASE}/messages/send?importId=${importId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageIds: selectedIds }),
      })
      if (res.ok) {
        // Ricarica per aggiornare gli stati
        const listRes = await fetch(`${API_BASE}/messages/imports`)
        if (listRes.ok) {
          const data: ImportMessaggio[] = await listRes.json()
          setImports(data)
        }
      } else if (res.status === 401) {
        setIsAuthenticated(false)
      }
    } catch (err) {
      console.error("Invio fallito:", err)
    } finally {
      setSending(false)
    }
  }, [imports, selectedMessageIds])

  const handleDelete = useCallback(async (importId: number) => {
    try {
      const res = await fetch(`${API_BASE}/messages/${importId}`, { method: "DELETE" })
      if (res.ok) {
        setConfirmDeleteId(null)
        // Ricarica la lista degli import
        const listRes = await fetch(`${API_BASE}/messages/imports`)
        if (listRes.ok) {
          const data: ImportMessaggio[] = await listRes.json()
          setImports(data)
          if (expandedId === importId) {
            if (data.length > 0) {
              setExpandedId(data[0].id)
            } else {
              setExpandedId(null)
            }
          }
        }
      } else if (res.status === 401) {
        setIsAuthenticated(false)
      } else {
        const errorData = await res.json()
        alert(errorData.message || "Errore durante l'eliminazione")
      }
    } catch (err) {
      console.error("Errore durante l'eliminazione:", err)
    }
  }, [expandedId])

  // Statistiche calcolate sull'import correntemente espanso
  const activeImport = imports.find((imp) => imp.id === expandedId)
  const totalCount = activeImport ? activeImport.righe.length : 0
  const importatoCount = activeImport ? activeImport.righe.filter((r) => r.stato === "IMPORTATO").length : 0
  const pendingCount = activeImport ? activeImport.righe.filter((r) => r.stato === "PENDING").length : 0
  const inviatoCount = activeImport ? activeImport.righe.filter((r) => r.stato === "INVIATO").length : 0
  const erroreCount = activeImport ? activeImport.righe.filter((r) => r.stato === "ERRORE").length : 0

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium mt-4 text-muted-foreground animate-pulse">
          Verifica sessione in corso...
        </p>
      </div>
    )
  }

  if (isAuthenticated === false) {
    return (
      <LoginForm apiBase={API_BASE} onLoginSuccess={() => setIsAuthenticated(true)} />
    )
  }



  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="w-full md:w-[80%] md:max-w-[80%] mx-auto flex h-16 items-center justify-between px-4 md:px-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-bold tracking-tight">WA Send</h1>
              <span className="text-xs text-muted-foreground font-medium">v{packageJson.version}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await fetch(`${API_BASE}/auth/logout`, { method: "POST" })
                  setIsAuthenticated(false)
                } catch (err) {
                  console.error("Errore logout:", err)
                }
              }}
              className="gap-2 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Esci</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full md:w-[80%] md:max-w-[80%] mx-auto space-y-6 px-4 md:px-0 py-8">
        {/* Upload + Stats Row */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Upload Card */}
          <Card className="md:col-span-2 group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Carica File HTML
              </CardTitle>
              <CardDescription>
                Seleziona un file HTML contenente la tabella dei messaggi da inviare
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleUpload(file)
                  }
                  e.target.value = ""
                }}
              />
              <div className="flex items-center gap-4">
                <Button
                  id="upload-button"
                  variant="outline"
                  className="relative overflow-hidden"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {uploading ? "Caricamento..." : "Scegli file"}
                </Button>
                {fileName && (
                  <span className="text-sm text-muted-foreground animate-in slide-in-from-left-2 duration-300">
                    📄 {fileName}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Riepilogo
                {activeImport && (
                  <Badge variant="outline" className="text-sm font-medium">
                    Import #{activeImport.id}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Totale</span>
                <span className="text-2xl font-bold tabular-nums">
                  {totalCount}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <FileDown className="h-3.5 w-3.5" /> Importati
                </span>
                <span className="font-semibold tabular-nums">{importatoCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-warning flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Invio in corso
                </span>
                <span className="font-semibold tabular-nums">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-success flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Inviati
                </span>
                <span className="font-semibold tabular-nums">{inviatoCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-danger flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5" /> Errore
                </span>
                <span className="font-semibold tabular-nums">{erroreCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista Importazioni Espandibili */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Cronologia importazioni</h2>
            <span className="text-xs text-muted-foreground">
              Seleziona un import per visualizzarne i dettagli e le statistiche
            </span>
          </div>

          {imports.length === 0 ? (
            <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-30 animate-pulse" />
                <p className="text-sm font-medium">Nessun import presente</p>
                <p className="text-xs mt-1">Carica un file HTML per iniziare</p>
              </CardContent>
            </Card>
          ) : (
            imports.map((imp) => {
              const isExpanded = expandedId === imp.id
              const formattedDate = new Date(imp.created).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "medium",
              })

              const selectableRows = imp.righe.filter((r) => r.stato === "IMPORTATO")
              const selectedRows = selectableRows.filter((r) => selectedMessageIds[r.id])
              const isAllSelected = selectableRows.length > 0 && selectedRows.length === selectableRows.length
              const isSomeSelected = selectedRows.length > 0 && selectedRows.length < selectableRows.length
              const impImportatoCount = selectableRows.length
              const selectedCount = selectedRows.length
              const impInviatoCount = imp.righe.filter((r) => r.stato === "INVIATO").length
              const impErroreCount = imp.righe.filter((r) => r.stato === "ERRORE").length
              const impPendingCount = imp.righe.filter((r) => r.stato === "PENDING").length

              // È possibile cancellare l'import solo se non ci sono messaggi inviati o in corso di invio
              const canDelete = imp.righe.every(
                (r) =>
                  r.stato === "IMPORTATO" ||
                  (r.stato === "ERRORE" &&
                    r.errore &&
                    (r.errore.includes("mancante") ||
                      r.errore.includes("vuoto") ||
                      r.errore.includes("non valido")))
              )

              return (
                <Card
                  key={imp.id}
                  className={`border-border/40 transition-all duration-300 overflow-hidden ${
                    isExpanded ? "ring-1 ring-primary/20 bg-card shadow-md" : "hover:bg-muted/30 bg-card/60"
                  }`}
                >
                  {/* Header dell'espandibile */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : imp.id)}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className={`p-1.5 rounded-md ${isExpanded ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-sm sm:text-base">
                        Import #{imp.id} — {formattedDate}
                      </span>
                      <Badge variant="secondary" className="text-sm font-medium">
                        {imp.righe.length === 1 ? "1 messaggio" : `${imp.righe.length} messaggi`}
                      </Badge>
                      <div className="flex gap-1.5 ml-2">
                        {impImportatoCount > 0 && (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs py-0.5 font-medium">
                            {impImportatoCount === 1 ? "1 da inviare" : `${impImportatoCount} da inviare`}
                          </Badge>
                        )}
                        {impPendingCount > 0 && (
                          <Badge variant="warning" className="text-xs py-0.5 font-medium animate-pulse">
                            {impPendingCount === 1 ? "1 invio in corso" : `${impPendingCount} invii in corso`}
                          </Badge>
                        )}
                        {impInviatoCount > 0 && (
                          <Badge variant="success" className="text-xs py-0.5 font-medium">
                            {impInviatoCount === 1 ? "1 inviato" : `${impInviatoCount} inviati`}
                          </Badge>
                        )}
                        {impErroreCount > 0 && (
                          <Badge variant="danger" className="text-xs py-0.5 font-medium">
                            {impErroreCount === 1 ? "1 errore" : `${impErroreCount} errori`}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground transition-transform duration-300" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-300" />
                      )}
                    </div>
                  </div>

                  {/* Dettaglio tabella (visibile solo se espanso) */}
                  {isExpanded && (
                    <CardContent className="border-t border-border/40 p-0 bg-background/30 animate-in slide-in-from-top-2 duration-300">
                      {/* Pulsante Invio Interno e Cestino per questo import */}
                      {(impImportatoCount > 0 || canDelete) && (
                        <div className="flex items-center justify-end gap-3 p-4 border-b border-border/40 bg-muted/20">
                          {confirmDeleteId === imp.id ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                              <span className="text-sm text-danger font-semibold">Confermi l'eliminazione dell'import?</span>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(imp.id)
                                }}
                                className="h-9"
                              >
                                Ok
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDeleteId(null)
                                }}
                                className="h-9"
                              >
                                Annulla
                              </Button>
                            </div>
                          ) : confirmSendId === imp.id ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                              <span className="text-sm text-warning font-semibold">
                                Confermi l'invio di {selectedCount === 1 ? "1 messaggio" : `${selectedCount} messaggi`}?
                              </span>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmSendId(null)
                                  handleSend(imp.id)
                                }}
                                className="h-9"
                              >
                                Ok
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmSendId(null)
                                }}
                                className="h-9"
                              >
                                Annulla
                              </Button>
                            </div>
                          ) : (
                            <>
                              {impImportatoCount > 0 && (
                                <Button
                                  id={`send-button-${imp.id}`}
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmSendId(imp.id)
                                    setConfirmDeleteId(null)
                                  }}
                                  disabled={sending || selectedCount === 0}
                                  className="gap-2 h-9"
                                >
                                  {sending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send className="h-3.5 w-3.5" />
                                  )}
                                  {sending
                                    ? "Invio..."
                                    : selectedCount === 1
                                    ? "Invia 1 messaggio"
                                    : `Invia ${selectedCount} messaggi`}
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  id={`delete-button-${imp.id}`}
                                  size="sm"
                                  variant="danger"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmDeleteId(imp.id)
                                    setConfirmSendId(null)
                                  }}
                                  className="h-9 w-9 p-0 flex items-center justify-center"
                                  title="Elimina import"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <div className="overflow-x-auto w-full">
                        <Table className="w-full table-fixed border-collapse">
                          <TableHeader>
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableHead className="w-[45px] text-center">
                                {selectableRows.length > 0 && (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-ring cursor-pointer accent-primary"
                                    checked={isAllSelected}
                                    ref={(el) => {
                                      if (el) {
                                        el.indeterminate = isSomeSelected
                                      }
                                    }}
                                    onChange={() => handleToggleAll(imp.id)}
                                  />
                                )}
                              </TableHead>
                              <TableHead className="w-[50px] text-center">#</TableHead>
                              <TableHead className="w-[90px]">Codice</TableHead>
                              <TableHead className="w-[190px]">Nominativo</TableHead>
                              <TableHead className="w-[165px]">Cellulare</TableHead>
                              <TableHead className="w-auto">Testo</TableHead>
                              <TableHead className="w-[155px]">Data Invio</TableHead>
                              <TableHead className="w-[145px] text-center">Stato</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {imp.righe.map((msg) => {
                              const isRowSelected = msg.stato === "IMPORTATO" && !!selectedMessageIds[msg.id]
                              return (
                                <TableRow
                                  key={msg.id}
                                  className={`transition-colors ${isRowSelected ? "bg-sky-500/10 hover:bg-sky-500/15" : "hover:bg-muted/10"}`}
                                >
                                  <TableCell className="w-[45px] text-center">
                                    {msg.stato === "IMPORTATO" ? (
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-ring cursor-pointer accent-primary"
                                        checked={!!selectedMessageIds[msg.id]}
                                        onChange={() => handleToggleRow(msg.id)}
                                      />
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground text-center">
                                    {msg.id}
                                  </TableCell>
                                  <TableCell className="truncate text-sm text-muted-foreground" title={msg.codice}>
                                    {msg.codice || "-"}
                                  </TableCell>
                                  <TableCell className="truncate text-sm text-muted-foreground" title={msg.nominativo}>
                                    {msg.nominativo}
                                  </TableCell>
                                  <TableCell className="truncate text-sm text-muted-foreground" title={msg.cellulare}>
                                    {formatDisplayPhone(msg.cellulare)}
                                  </TableCell>
                                  <TableCell className="select-text text-muted-foreground">
                                    <p className="truncate text-sm text-muted-foreground" title={msg.testo}>{msg.testo}</p>
                                    {msg.errore && (
                                      <p className="text-[11px] text-danger mt-1 font-medium line-clamp-2" title={msg.errore}>
                                        ⚠️ {msg.errore}
                                      </p>
                                    )}
                                  </TableCell>
                                  <TableCell className="truncate text-sm text-muted-foreground">
                                    {formatDateTime(msg.inviato)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <StatusBadge stato={msg.stato} />
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
