interface PageHeaderProps {
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/** Consistent page heading used across every analysis surface. */
export default function PageHeader({ eyebrow, eyebrowIcon, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="eyebrow text-coral-500">
            {eyebrowIcon} {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl md:text-[1.75rem] font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-[var(--text-body)] max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
