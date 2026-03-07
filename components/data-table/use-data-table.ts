"use client";

import { useState, useMemo } from "react";

export type SortDir = "asc" | "desc";

export interface UseDataTableOptions<T> {
  data: T[];
  pageSize?: number;
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  getSortValue?: (row: T, key: string) => string | number;
}

export function useDataTable<T>({
  data,
  pageSize = 15,
  defaultSortKey,
  defaultSortDir = "asc",
  getSortValue,
}: UseDataTableOptions<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [page, setPage] = useState(1);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sorted = useMemo(() => {
    if (!sortKey || !getSortValue) return data;
    return [...data].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, getSortValue]);

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const pagedData = pageSize > 0 ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;

  return { sortKey, sortDir, toggleSort, page, setPage, pageCount, pagedData, totalCount: data.length };
}
