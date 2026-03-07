export function HelpIcon({ text }: { text: string }) {
  return (
    <button
      type="button"
      title={text}
      className="cursor-help inline-flex items-center justify-center w-5 h-5 rounded-full border border-border text-muted-foreground text-[10px] font-bold hover:bg-muted transition-colors shrink-0"
    >
      ?
    </button>
  );
}
