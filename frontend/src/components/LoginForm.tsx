import { useState } from "react"
import { Lock, Loader2, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface LoginFormProps {
  apiBase: string
  onLoginSuccess: () => void
}

export function LoginForm({ apiBase, onLoginSuccess }: LoginFormProps) {
  const [passwordInput, setPasswordInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordInput.trim()) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      })
      if (res.ok) {
        onLoginSuccess()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.message || "Password non corretta. Riprova.")
      }
    } catch {
      setError("Impossibile connettersi al server. Verifica la tua connessione.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between relative overflow-hidden">
      {/* Background radial glow effect */}
      <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="w-full md:w-[80%] md:max-w-[80%] mx-auto flex h-16 items-center justify-between px-4 md:px-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">WA Send</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <Card className="max-w-md w-full border-border/40 bg-card/65 backdrop-blur-md shadow-2xl relative overflow-hidden group transition-all duration-300 hover:border-primary/30">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-100" />
          
          <CardHeader className="text-center relative z-10 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.05)] group-hover:scale-105 transition-transform duration-300">
              <Lock className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Accesso Amministratore
            </CardTitle>
            <CardDescription className="mt-1.5 text-xs text-muted-foreground">
              Inserisci la password di amministrazione per sbloccare l'applicazione
            </CardDescription>
          </CardHeader>

          <CardContent className="relative z-10 pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <input
                  type="password"
                  placeholder="Inserisci la password..."
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border/60 bg-background/50 backdrop-blur-sm text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-muted-foreground"
                  disabled={loading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                  ⚠️ {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !passwordInput.trim()}
                className="w-full py-2.5 h-10 text-sm font-semibold gap-2 relative overflow-hidden active:scale-[0.98] transition-transform duration-200 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifica...
                  </>
                ) : (
                  "Accedi"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border/40 text-center text-xs text-muted-foreground">
        <p>&copy; 2026 WA Send. Tutti i diritti riservati.</p>
      </footer>
    </div>
  )
}
