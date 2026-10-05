import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useBreakpoint, type Breakpoint } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { motionPresets } from "@/lib/motion";
import { EmptyState, type EmptyStateProps } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Skeleton } from "@/components/ui/Skeleton";

export type MobileRole = "title" | "subtitle" | "value" | "meta" | "detail" | "hidden";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Value for client-side sorting; giving one makes the column sortable. */
  sortValue?: (row: T) => number | string | null | undefined;
  /** Force sortable on/off (server-side sorting: true without sortValue). */
  sortable?: boolean;
  /** First click sorts descending (default true — biggest P&L / newest first). */
  sortDescFirst?: boolean;
  align?: "left" | "right" | "center";
  width?: number | string;
  className?: string;
  headerClassName?: string;
  /** ⓘ explanation in the header. */
  info?: ReactNode;
  /** Hide this column below a breakpoint in table mode. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /**
   * Role in the stacked card layout used below `mobileBreakpoint`:
   * title / subtitle (left), value / meta (right), detail (2-column grid), hidden.
   * Default: first column = title, others = detail.
   */
  mobile?: MobileRole;
  /** Label for `detail` fields (defaults to the header when it is a string). */
  mobileLabel?: string;
}

export interface SortState {
  id: string;
  desc: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  rowKey: (row: T, index: number) => string;
  /** First load: skeleton rows while `data` is undefined. */
  loading?: boolean;
  /** Refetching with data on screen: rows dim slightly (the frame is kept). */
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Empty state shown when data is []. */
  empty?: EmptyStateProps | ReactNode;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  rowClassName?: (row: T) => string | undefined;
  density?: "compact" | "comfortable";
  /** Max height of the scroll area; enables the sticky header. */
  maxHeight?: number | string;
  /** Controlled sort (server-side): pass both. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Uncontrolled initial sort (client-side). */
  defaultSort?: SortState;
  /** Below this breakpoint rows render as stacked cards (default "md"). Use `false` to always render a table. */
  mobileBreakpoint?: Breakpoint | false;
  skeletonRows?: number;
  /** Animate rows that appear (live feeds). */
  animateRows?: boolean;
  caption?: string;
  footer?: ReactNode;
  className?: string;
}

const HIDE_BELOW: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

function compare(a: unknown, b: unknown): number {
  const aMissing = a === null || a === undefined || (typeof a === "number" && Number.isNaN(a));
  const bMissing = b === null || b === undefined || (typeof b === "number" && Number.isNaN(b));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function isEmptyStateProps(value: unknown): value is EmptyStateProps {
  return typeof value === "object" && value !== null && "title" in value && !("$$typeof" in value);
}

/**
 * Data table: sortable columns, sticky header, hover + click rows, skeleton rows, empty and
 * error states, compact density, and a stacked-card layout on small screens driven by each
 * column's `mobile` role.
 *
 *   <DataTable data={trades} rowKey={(t) => t.id} columns={columns} onRowClick={open}
 *     loading={q.isPending} error={q.error} onRetry={q.refetch}
 *     empty={{ title: "No trades yet", description: "Closed trades appear here." }} />
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  fetching,
  error,
  onRetry,
  empty,
  onRowClick,
  isRowSelected,
  rowClassName,
  density = "comfortable",
  maxHeight,
  sort: controlledSort,
  onSortChange,
  defaultSort,
  mobileBreakpoint = "md",
  skeletonRows = 6,
  animateRows,
  caption,
  footer,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState | null>(defaultSort ?? null);
  const controlled = onSortChange !== undefined;
  const sort = controlled ? (controlledSort ?? null) : internalSort;
  const wide = useBreakpoint(mobileBreakpoint || "xs");
  const asCards = mobileBreakpoint !== false && !wide;

  const rows = useMemo(() => {
    if (!data) return undefined;
    if (controlled || !sort) return data;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortValue) return data;
    const get = column.sortValue;
    return data
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const result = compare(get(a.row), get(b.row));
        if (result === 0) return a.index - b.index;
        const missingLast = get(a.row) === null || get(a.row) === undefined || get(b.row) === null || get(b.row) === undefined;
        return sort.desc && !missingLast ? -result : result;
      })
      .map(({ row }) => row);
  }, [data, columns, sort, controlled]);

  const toggleSort = (column: Column<T>) => {
    const descFirst = column.sortDescFirst ?? true;
    let next: SortState | null;
    if (!sort || sort.id !== column.id) next = { id: column.id, desc: descFirst };
    else if (sort.desc === descFirst) next = { id: column.id, desc: !descFirst };
    else next = null;
    if (controlled) onSortChange?.(next);
    else setInternalSort(next);
  };

  const showSkeleton = loading && !rows;
  const showError = Boolean(error) && !rows?.length;
  const showEmpty = !showSkeleton && !showError && rows !== undefined && rows.length === 0;

  const emptyNode = isEmptyStateProps(empty) ? (
    <EmptyState size="sm" {...empty} />
  ) : (
    (empty ?? <EmptyState size="sm" title="Nothing to show" />)
  );

  const onKeyDown = (event: KeyboardEvent, row: T) => {
    if (!onRowClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  };

  if (asCards) {
    return (
      <MobileCards
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        onRowClick={onRowClick}
        onKeyDown={onKeyDown}
        isRowSelected={isRowSelected}
        showSkeleton={Boolean(showSkeleton)}
        skeletonRows={Math.min(skeletonRows, 4)}
        showError={showError}
        error={error}
        onRetry={onRetry}
        showEmpty={showEmpty}
        emptyNode={emptyNode}
        fetching={fetching}
        footer={footer}
        className={className}
      />
    );
  }

  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const RowTag = animateRows ? motion.tr : "tr";

  return (
    <div className={cn("relative min-w-0", className)}>
      <div className="overflow-auto" style={maxHeight !== undefined ? { maxHeight } : undefined}>
        <table className="w-full border-separate border-spacing-0 text-dense">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => {
                const sortable = column.sortable ?? Boolean(column.sortValue);
                const active = sort?.id === column.id;
                const SortIcon = active ? (sort?.desc ? ArrowDown : ArrowUp) : ChevronsUpDown;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width !== undefined ? { width: column.width } : undefined}
                    aria-sort={active ? (sort?.desc ? "descending" : "ascending") : undefined}
                    className={cn(
                      "sticky top-0 z-10 h-9 border-b border-line bg-surface-2 px-3 text-[11px] font-medium tracking-[0.05em] whitespace-nowrap text-fg-subtle uppercase first:pl-4 last:pr-4",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.hideBelow && HIDE_BELOW[column.hideBelow],
                      column.headerClassName,
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        column.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column)}
                          className={cn(
                            "group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 uppercase transition-colors hover:text-fg",
                            active && "text-fg",
                            column.align === "right" && "flex-row-reverse",
                          )}
                        >
                          {column.header}
                          <SortIcon
                            aria-hidden
                            className={cn(
                              "size-3 shrink-0 transition-opacity",
                              active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-60",
                            )}
                          />
                        </button>
                      ) : (
                        column.header
                      )}
                      {column.info ? <InfoTooltip content={column.info} /> : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn("transition-opacity duration-200", fetching && rows && "opacity-60")}>
            {showSkeleton
              ? Array.from({ length: skeletonRows }, (_, r) => (
                  <tr key={`sk-${r}`}>
                    {columns.map((column, c) => (
                      <td
                        key={column.id}
                        className={cn(
                          cellPad,
                          "border-b border-line-subtle first:pl-4 last:pr-4",
                          column.hideBelow && HIDE_BELOW[column.hideBelow],
                        )}
                      >
                        <Skeleton
                          className={cn(
                            "h-3",
                            column.align === "right" && "ml-auto",
                            c === 0 ? "w-24" : (r + c) % 3 === 0 ? "w-12" : "w-16",
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {showError ? (
              <tr>
                <td colSpan={columns.length}>
                  <ErrorState error={error} onRetry={onRetry} className="py-8" />
                </td>
              </tr>
            ) : null}
            {showEmpty ? (
              <tr>
                <td colSpan={columns.length}>{emptyNode}</td>
              </tr>
            ) : null}
            <AnimatePresence initial={false}>
              {!showError &&
                rows?.map((row, index) => {
                  const selected = isRowSelected?.(row) ?? false;
                  return (
                    <RowTag
                      key={rowKey(row, index)}
                      {...(animateRows ? motionPresets.listItem : {})}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={onRowClick ? (event: KeyboardEvent) => onKeyDown(event, row) : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-selected={isRowSelected ? selected : undefined}
                      className={cn(
                        "group/row transition-colors duration-100",
                        onRowClick && "cursor-pointer focus-visible:outline-none",
                        "hover:bg-fg/[0.025] focus-visible:bg-fg/[0.04]",
                        selected && "bg-accent/[0.06] hover:bg-accent/[0.08]",
                        rowClassName?.(row),
                      )}
                    >
                      {columns.map((column, c) => (
                        <td
                          key={column.id}
                          className={cn(
                            cellPad,
                            "border-b border-line-subtle align-middle first:pl-4 last:pr-4",
                            column.align === "right" && "text-right",
                            column.align === "center" && "text-center",
                            column.hideBelow && HIDE_BELOW[column.hideBelow],
                            c === 0 && selected && "shadow-[inset_2px_0_0_var(--accent)]",
                            column.className,
                          )}
                        >
                          {column.cell(row, index)}
                        </td>
                      ))}
                    </RowTag>
                  );
                })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      {footer ? <div className="border-t border-line px-4 py-2.5">{footer}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- stacked cards (small screens)

interface MobileCardsProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  onKeyDown: (event: KeyboardEvent, row: T) => void;
  isRowSelected?: (row: T) => boolean;
  showSkeleton: boolean;
  skeletonRows: number;
  showError: boolean;
  error: unknown;
  onRetry?: () => void;
  showEmpty: boolean;
  emptyNode: ReactNode;
  fetching?: boolean;
  footer?: ReactNode;
  className?: string;
}

function roleOf<T>(column: Column<T>, index: number, hasTitle: boolean): MobileRole {
  if (column.mobile) return column.mobile;
  if (!hasTitle && index === 0) return "title";
  return "detail";
}

function MobileCards<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  onKeyDown,
  isRowSelected,
  showSkeleton,
  skeletonRows,
  showError,
  error,
  onRetry,
  showEmpty,
  emptyNode,
  fetching,
  footer,
  className,
}: MobileCardsProps<T>) {
  const hasTitle = columns.some((c) => c.mobile === "title");
  const byRole = (role: MobileRole) => columns.filter((c, i) => roleOf(c, i, hasTitle) === role);
  const title = byRole("title");
  const subtitle = byRole("subtitle");
  const value = byRole("value");
  const meta = byRole("meta");
  const detail = byRole("detail");

  return (
    <div className={cn("min-w-0", className)}>
      {showSkeleton ? (
        <ul className="divide-y divide-line-subtle" aria-hidden>
          {Array.from({ length: skeletonRows }, (_, i) => (
            <li key={i} className="space-y-2.5 px-4 py-3.5">
              <div className="flex justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {showError ? <ErrorState error={error} onRetry={onRetry} className="py-8" /> : null}
      {showEmpty ? emptyNode : null}
      {!showError && rows?.length ? (
        <ul className={cn("divide-y divide-line-subtle transition-opacity", fetching && "opacity-60")}>
          {rows.map((row, index) => {
            const selected = isRowSelected?.(row) ?? false;
            return (
              <li
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => onKeyDown(event, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  "px-4 py-3 transition-colors",
                  onRowClick && "cursor-pointer active:bg-fg/[0.04]",
                  selected && "bg-accent/[0.06] shadow-[inset_2px_0_0_var(--accent)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    {title.length ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-dense font-medium text-fg">
                        {title.map((c) => (
                          <span key={c.id} className="min-w-0">
                            {c.cell(row, index)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {subtitle.length ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                        {subtitle.map((c) => (
                          <span key={c.id}>{c.cell(row, index)}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {value.length || meta.length ? (
                    <div className="shrink-0 space-y-0.5 text-right">
                      {value.map((c) => (
                        <div key={c.id} className="text-dense font-medium">
                          {c.cell(row, index)}
                        </div>
                      ))}
                      {meta.map((c) => (
                        <div key={c.id} className="text-xs text-fg-subtle">
                          {c.cell(row, index)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {detail.length ? (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {detail.map((c) => (
                      <div key={c.id} className="flex min-w-0 items-baseline justify-between gap-2">
                        <dt className="truncate text-[11px] text-fg-subtle">
                          {c.mobileLabel ?? (typeof c.header === "string" ? c.header : c.id)}
                        </dt>
                        <dd className="min-w-0 truncate text-right text-xs text-fg">{c.cell(row, index)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {footer ? <div className="border-t border-line px-4 py-2.5">{footer}</div> : null}
    </div>
  );
}
