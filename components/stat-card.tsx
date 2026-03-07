import Link from "next/link";

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  subColor?: string;
  accent?: string;
  href?: string;
  warn?: boolean;
  icon?: React.ReactNode;
}

export function StatCard({
  label,
  value,
  sub,
  subColor = "text-muted-foreground",
  accent,
  href,
  warn,
  icon,
}: StatCardProps) {
  const isWarning = warn && Number(value) > 0;

  const inner = (
    <>
      <div className="flex justify-between items-start mb-1">
        <p
          className={`text-[10px] font-bold uppercase tracking-wider ${
            isWarning ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
          }`}
        >
          {label}
        </p>
        {icon}
      </div>
      <p className={`text-4xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>}
    </>
  );

  const containerClass = `p-4 border rounded-xl ${
    isWarning
      ? "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30"
      : "bg-card border-border"
  }`;

  if (href) {
    return (
      <Link href={href} className={`${containerClass} block hover:bg-muted/40 transition-colors`}>
        {inner}
      </Link>
    );
  }

  return <div className={containerClass}>{inner}</div>;
}
