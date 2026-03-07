"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RabbitUser } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useSetHeaderActions } from "@/components/layout/header-actions-context";

// ── tag config ────────────────────────────────────────────────────────────────

const TAG_STYLES: Record<string, string> = {
  administrator: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  monitoring: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  management: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  policymaker: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
};

const ALL_TAGS = ["administrator", "monitoring", "management", "policymaker"] as const;
type TagName = typeof ALL_TAGS[number];

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${TAG_STYLES[tag] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {tag}
    </span>
  );
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  return String(tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

function serializeTags(tags: string[]): string {
  return tags.join(",");
}

// ── confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  message, onConfirm, onCancel, danger = false,
}: {
  message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-background border rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <p className="text-sm">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded-md bg-background hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${danger ? "bg-destructive text-destructive-foreground hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-90"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── user drawer ───────────────────────────────────────────────────────────────

type UserDrawerMode = { mode: "add" } | { mode: "edit"; user: RabbitUser };

function UserDrawer({
  drawerMode,
  onClose,
  onSaved,
}: {
  drawerMode: UserDrawerMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = drawerMode.mode === "edit";
  const editUser = isEdit ? drawerMode.user : null;

  const [username, setUsername] = useState(editUser?.name ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    editUser ? parseTags(editUser.tags) : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSave() {
    setError("");
    if (!username.trim()) { setError("Username is required."); return; }
    if (!isEdit && !password) { setError("Password is required for new users."); return; }
    if (password && password !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    try {
      const tags = serializeTags(selectedTags);

      if (isEdit) {
        const body = password
          ? { password, tags }
          : { password_hash: editUser!.password_hash, hashing_algorithm: editUser!.hashing_algorithm, tags };

        const res = await fetch(`/api/rabbitmq/users/${encodeURIComponent(editUser!.name)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { error?: string };
        if (json.error) throw new Error(json.error);
      } else {
        const res = await fetch("/api/rabbitmq/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: username.trim(), password, tags }),
        });
        const json = (await res.json()) as { error?: string };
        if (json.error) throw new Error(json.error);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full z-50 w-[400px] bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">{isEdit ? `Edit: ${editUser!.name}` : "Add User"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Username</label>
            <input
              className="w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:bg-muted"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">
              Password {isEdit && <span className="text-xs font-normal text-muted-foreground">(leave blank to keep existing)</span>}
            </label>
            <div className="relative">
              <input
                className="w-full px-3 py-2 pr-10 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  {showPassword ? (
                    <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M2 2 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>
                  ) : (
                    <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/></>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {password && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Confirm Password</label>
              <input
                className={`w-full px-3 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary ${confirmPassword && confirmPassword !== password ? "border-destructive" : ""}`}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold">Tags</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? TAG_STYLES[tag] + " border-current"
                        : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${active ? "bg-current border-current" : "border-muted-foreground/40"}`}>
                      {active && (
                        <svg className="w-2.5 h-2.5 text-background" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5 L4 7 L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save User"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border text-sm font-medium rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </aside>
    </>
  );
}

// ── pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const visible: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) visible.push(i);
    else if (visible[visible.length - 1] !== "…") visible.push("…");
  }
  return (
    <div className="flex gap-1">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">‹</button>
      {visible.map((v, i) =>
        v === "…"
          ? <span key={`e${i}`} className="px-2.5 py-1.5 text-muted-foreground">…</span>
          : <button key={v} onClick={() => onChange(v as number)}
              className={`px-2.5 py-1.5 border rounded font-medium transition-colors ${v === page ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
              {v}
            </button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === Math.ceil(total / PAGE_SIZE)}
        className="px-2.5 py-1.5 border rounded bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">›</button>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const qc = useQueryClient();

  const [userSearch, setUserSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const [userDrawer, setUserDrawer] = useState<UserDrawerMode | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RabbitUser | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  useSetHeaderActions(
    <button
      onClick={() => setUserDrawer({ mode: "add" })}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
    >
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M8 3 V13 M3 8 H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Add User
    </button>
  );

  const { data: whoami } = useQuery<string>({
    queryKey: ["whoami"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/whoami");
      const json = (await res.json()) as { data?: string };
      return json.data ?? "";
    },
    staleTime: Infinity,
  });

  const { data: users, isError: usersError } = useQuery<RabbitUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/users");
      const json = (await res.json()) as { data?: RabbitUser[]; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: permissions } = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: async () => {
      const res = await fetch("/api/rabbitmq/permissions");
      const json = (await res.json()) as { data?: Array<{ user: string; vhost: string }>; error?: string };
      if (json.error) throw new Error(json.error);
      return json.data ?? [];
    },
    refetchInterval: 15_000,
  });

  // vhost count per user
  const vhostCountByUser = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of permissions ?? []) {
      map[p.user] = (map[p.user] ?? 0) + 1;
    }
    return map;
  }, [permissions]);

  // filtered users
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = userSearch.toLowerCase();
    return users.filter((u) => {
      const matchSearch = !q || u.name.toLowerCase().includes(q);
      const matchTag = tagFilter === "all" || parseTags(u.tags).includes(tagFilter);
      return matchSearch && matchTag;
    });
  }, [users, userSearch, tagFilter]);

  const pagedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);

  async function handleDeleteUser(user: RabbitUser) {
    setDeleting((prev) => new Set(prev).add(user.name));
    try {
      await fetch(`/api/rabbitmq/users/${encodeURIComponent(user.name)}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      await qc.invalidateQueries({ queryKey: ["admin-permissions"] });
    } finally {
      setDeleting((prev) => { const n = new Set(prev); n.delete(user.name); return n; });
    }
    setDeleteConfirm(null);
  }

  function onUserSaved() {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    setUserDrawer(null);
  }

  return (
    <div className="space-y-6">
      {deleteConfirm && (
        <ConfirmDialog
          danger
          message={`Delete user "${deleteConfirm.name}"? This may drop active connections using this account.`}
          onConfirm={() => handleDeleteUser(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {userDrawer && (
        <UserDrawer drawerMode={userDrawer} onClose={() => setUserDrawer(null)} onSaved={onUserSaved} />
      )}

      {usersError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load data. Check your RabbitMQ connection.
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2 bg-background border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Search by username…"
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
          />
        </div>
        <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setUserPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {ALL_TAGS.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* users table */}
      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-3">Username</th>
                <th className="px-6 py-3">Tags</th>
                <th className="px-6 py-3">Vhost Access</th>
                <th className="px-6 py-3 text-center">Password</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!users ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : pagedUsers.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No users found</td></tr>
              ) : (
                pagedUsers.map((user) => {
                  const isYou = user.name === whoami;
                  const tags = parseTags(user.tags);
                  const vhostCount = vhostCountByUser[user.name] ?? 0;
                  const hasPassword = !!user.password_hash;
                  const noPerms = vhostCount === 0;

                  return (
                    <tr key={user.name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          {isYou && (
                            <span className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-bold uppercase tracking-wider">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {tags.length === 0 ? (
                          <span className="text-muted-foreground italic text-xs">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((t) => <TagBadge key={t} tag={t} />)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {noPerms ? (
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                              <path d="M6 1 L11 10 H1 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                              <path d="M6 5 V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                              <circle cx="6" cy="8.5" r="0.5" fill="currentColor"/>
                            </svg>
                            No permissions
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {vhostCount} {vhostCount === 1 ? "vhost" : "vhosts"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {hasPassword ? (
                          <svg className="w-4 h-4 text-emerald-500 mx-auto" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M5 8 L7 10 L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-muted-foreground/40 mx-auto" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setUserDrawer({ mode: "edit", user })}
                            className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                            title="Edit user"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                              <path d="M11 2 L14 5 L5 14 H2 V11 L11 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => !isYou && setDeleteConfirm(user)}
                            disabled={isYou || deleting.has(user.name)}
                            className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={isYou ? "Cannot delete your own account" : "Delete user"}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                              <path d="M2 4 H14 M5 4 V2.5 H11 V4 M6 7 V12 M10 7 V12 M3 4 L4 14 H12 L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-muted/30 border-t flex justify-between items-center text-sm text-muted-foreground">
          <span>
            {filteredUsers.length === 0
              ? "No users"
              : `Showing ${(userPage - 1) * PAGE_SIZE + 1}–${Math.min(userPage * PAGE_SIZE, filteredUsers.length)} of ${filteredUsers.length}`}
          </span>
          <Pagination page={userPage} total={filteredUsers.length} onChange={setUserPage} />
        </div>
      </div>
    </div>
  );
}
