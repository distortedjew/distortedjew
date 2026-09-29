export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-20">
      <h1 className="type-poster text-5xl sm:text-6xl">{title}</h1>
      <p className="mt-4 text-sm text-muted-foreground">Last updated {updated}</p>
      <div className="prose-legal mt-10 flex flex-col gap-6 text-base leading-relaxed text-foreground/90 [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </article>
  );
}
