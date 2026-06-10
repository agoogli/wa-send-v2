import { useState, useRef, useCallback, useEffect } from "react"
import {
  Upload,
  Send,
  FileText,
  Wifi,
  WifiOff,
  Loader2,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
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

const API_BASE = "/api"

interface Message {
  id: number
  recipient: string
  content: string
  status: "PENDING" | "SENT" | "FAILED"
  error: string | null
  createdAt: string
  updatedAt: string
}

interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "connected"
  qrCode: string | null
}

function StatusIndicator({ status }: { status: WhatsAppStatus["status"] }) {
  const config = {
    connected: {
      icon: Wifi,
      label: "Connesso",
      className: "text-success",
      dot: "bg-success animate-pulse",
    },
    connecting: {
      icon: Loader2,
      label: "Connessione...",
      className: "text-warning",
      dot: "bg-warning animate-pulse",
    },
    disconnected: {
      icon: WifiOff,
      label: "Disconnesso",
      className: "text-danger",
      dot: "bg-danger",
    },
  }
  const c = config[status]
  const Icon = c.icon

  return (
    <div className={`flex items-center gap-2 ${c.className}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
      <Icon className={`h-4 w-4 ${status === "connecting" ? "animate-spin" : ""}`} />
      <span className="text-sm font-medium">{c.label}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: Message["status"] }) {
  const config = {
    PENDING: {
      variant: "warning" as const,
      icon: Clock,
      label: "In attesa",
    },
    SENT: {
      variant: "success" as const,
      icon: CheckCircle2,
      label: "Inviato",
    },
    FAILED: {
      variant: "danger" as const,
      icon: XCircle,
      label: "Fallito",
    },
  }
  const c = config[status]
  const Icon = c.icon

  return (
    <Badge variant={c.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  )
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({
    status: "disconnected",
    qrCode: null,
  })
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Poll WhatsApp status
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/whatsapp/status`)
        if (res.ok) {
          setWaStatus(await res.json())
        }
      } catch {
        // Backend not available
      }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [])

  // Fetch messages on mount
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages`)
        if (res.ok) {
          setMessages(await res.json())
        }
      } catch {
        // Backend not available
      }
    }
    fetchMessages()
  }, [])

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
        const data = await res.json()
        setMessages(data.messages)
      }
    } catch (err) {
      console.error("Upload failed:", err)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleSend = useCallback(async () => {
    setSending(true)
    try {
      const res = await fetch(`${API_BASE}/messages/send`, { method: "POST" })
      if (res.ok) {
        // Refresh messages after sending
        const msgRes = await fetch(`${API_BASE}/messages`)
        if (msgRes.ok) {
          setMessages(await msgRes.json())
        }
      }
    } catch (err) {
      console.error("Send failed:", err)
    } finally {
      setSending(false)
    }
  }, [])

  const pendingCount = messages.filter((m) => m.status === "PENDING").length
  const sentCount = messages.filter((m) => m.status === "SENT").length
  const failedCount = messages.filter((m) => m.status === "FAILED").length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">WA Send</h1>
          </div>
          <StatusIndicator status={waStatus.status} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {/* QR Code Card — shown when connecting */}
        {waStatus.status === "connecting" && waStatus.qrCode && (
          <Card className="border-warning/30 bg-warning/5 animate-in fade-in duration-500">
            <CardHeader className="text-center">
              <CardTitle className="text-warning">Scansiona il QR Code</CardTitle>
              <CardDescription>
                Apri WhatsApp sul tuo telefono → Impostazioni → Dispositivi collegati → Collega un dispositivo
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <img
                src={waStatus.qrCode}
                alt="WhatsApp QR Code"
                className="h-64 w-64 rounded-xl border border-border p-2 bg-white"
              />
            </CardContent>
          </Card>
        )}

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
                  if (file) handleUpload(file)
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
              <CardTitle className="text-base">Riepilogo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Totale</span>
                <span className="text-2xl font-bold tabular-nums">
                  {messages.length}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-warning flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> In attesa
                </span>
                <span className="font-semibold tabular-nums">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-success flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Inviati
                </span>
                <span className="font-semibold tabular-nums">{sentCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-danger flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5" /> Falliti
                </span>
                <span className="font-semibold tabular-nums">{failedCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Send Button */}
        {messages.length > 0 && pendingCount > 0 && (
          <div className="flex justify-end animate-in slide-in-from-bottom-2 duration-300">
            <Button
              id="send-button"
              size="lg"
              onClick={handleSend}
              disabled={sending || waStatus.status !== "connected"}
              className="gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending
                ? "Invio in corso..."
                : `Invia ${pendingCount} messaggi`}
            </Button>
          </div>
        )}

        {/* Messages Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Messaggi
            </CardTitle>
            <CardDescription>
              {messages.length === 0
                ? "Carica un file HTML per visualizzare i messaggi"
                : `${messages.length} messaggi caricati`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">Nessun messaggio caricato</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Destinatario</TableHead>
                      <TableHead className="min-w-[300px]">Messaggio</TableHead>
                      <TableHead className="w-28 text-center">Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((msg, idx) => (
                      <TableRow
                        key={msg.id}
                        className="animate-in fade-in duration-300"
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {msg.id}
                        </TableCell>
                        <TableCell className="font-medium font-mono">
                          {msg.recipient}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="truncate">{msg.content}</p>
                          {msg.error && (
                            <p className="mt-1 text-xs text-danger truncate">
                              ⚠ {msg.error}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={msg.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
