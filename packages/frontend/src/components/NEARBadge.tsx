interface Props {
  txHash:      string
  explorerUrl: string
  blockHeight?: number
}

export default function NEARBadge({ txHash, explorerUrl }: Props): JSX.Element {
  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-500/30 text-blue-300 text-[11px] font-mono hover:border-blue-400/60 transition-colors"
      title="Ver en NEAR Explorer (Testnet)"
    >
      <span>🔗</span>
      <span>NEAR Testnet</span>
      <span className="text-blue-400">·</span>
      <span className="text-blue-200">{txHash.slice(0, 8)}…</span>
    </a>
  )
}
