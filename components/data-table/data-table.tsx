"use client";

import { ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DataTablePagination } from "./data-table-pagination";
import { cn } from "@/lib/utils";
import type { SortDir } from "./use-data-table";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  pageSize?: number;
  isLoading?: boolean;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string;
  emptyMessage?: string;
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  page?: number;
  pageCount?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
}

export function DataTable<T>({
  columns,
  data,
  pageSize = 15,
  isLoading,
  skeletonRows = 5,
  onRowClick,
  getRowClassName,
  emptyMessage = "No results",
  sortKey,
  sortDir = "asc",
  onSort,
  page = 1,
  pageCount = 1,
  totalCount,
  onPageChange,
}: DataTableProps<T>) {
  const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(alignClass[col.align ?? "left"], col.sortable && onSort && "cursor-pointer select-none")}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                <span className="inline-flex items-center">
                  {col.header}
                  {col.sortable && onSort && (
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <div className="h-4 rounded bg-muted animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  getRowClassName?.(row),
                )}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={alignClass[col.align ?? "left"]}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {onPageChange && pageSize > 0 && (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          totalCount={totalCount ?? data.length}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
