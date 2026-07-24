interface TotalSentStatsProps {
  totalSent: number
  firstSentDate: string | null
}

export function TotalSentStats({ totalSent, firstSentDate }: TotalSentStatsProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-"
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return "-"
    const pad = (n: number) => String(n).padStart(2, "0")
    const dd = pad(d.getDate())
    const mm = pad(d.getMonth() + 1)
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  const dateDisplay = formatDate(firstSentDate)

  return (
    <span className="text-xs text-muted-foreground">
      Totale messaggi inviati dal {dateDisplay}: {totalSent}
    </span>
  )
}
