"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, ShieldOff, UserPlus, Users as UsersIcon } from "lucide-react";

import { DealFlowNav } from "@/components/dealflow-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { UserDto } from "@/modules/users/application/types";

const ROLES = ["ADMIN", "SALES_REP", "MANAGER", "FINANCE_OPS", "CUSTOMER"] as const;

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  SALES_REP: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  MANAGER: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  FINANCE_OPS: "border-purple-400/30 bg-purple-400/10 text-purple-200",
  CUSTOMER: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

export default function UsersPage() {
  const { user: me, isLoading: meLoading } = useCurrentUser();
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<(typeof ROLES)[number]>("SALES_REP");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await apiRequest<UserDto[]>("/api/users"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await apiRequest("/api/users", {
        method: "POST",
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword, role: newRole }),
      });
      setIsCreating(false);
      setNewEmail("");
      setNewPassword("");
      setNewRole("SALES_REP");
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : "Failed to create user.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this account? They will no longer be able to sign in.")) return;
    try {
      await apiRequest(`/api/users/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to deactivate user.");
    }
  }

  async function handleReactivate(id: string) {
    try {
      await apiRequest(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to reactivate user.");
    }
  }

  if (!meLoading && me && me.role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-[#171b22] text-slate-100">
        <DealFlowNav />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <ShieldOff className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="mt-4 text-xl font-bold text-white">Administrator access required</h1>
          <p className="mt-2 text-sm text-slate-400">Only ADMIN accounts can manage users.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#171b22] text-slate-100">
      <DealFlowNav />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-6">
        <section className="rounded-xl border border-slate-600/60 bg-[#232a34] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
                Admin
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Users &amp; Role-Based Login
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Create SALES_REP, MANAGER, FINANCE_OPS, or ADMIN accounts. Anyone else who signs in
                at /login with an unrecognized email is automatically provisioned as a CUSTOMER.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="bg-sky-500 font-medium text-white hover:bg-sky-400"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New User
              </Button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES.map((role) => (
              <div key={role} className="rounded-lg border border-slate-700/60 bg-[#1c222b] p-4">
                <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                  <span>{role.replace("_", " ")}</span>
                  <UsersIcon className="h-4 w-4 text-slate-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {users?.filter((u) => u.role === role).length ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-slate-700/60 bg-[#232a34] p-6 shadow-xl">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-300 uppercase">
            All Accounts
          </h2>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading users...</div>
          ) : (users ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No users yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Email</TableHead>
                    <TableHead className="text-slate-300">Role</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Created</TableHead>
                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users ?? []).map((u) => (
                    <TableRow key={u.id} className="border-slate-800 transition-colors hover:bg-slate-800/50">
                      <TableCell className="font-medium text-white">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={`border px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[u.role] ?? ""}`}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`border text-xs ${
                            u.isActive
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                              : "border-slate-500/30 bg-slate-500/10 text-slate-400"
                          }`}
                        >
                          {u.isActive ? "Active" : "Deactivated"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeactivate(u.id)}
                            className="border-rose-900/40 bg-rose-950/20 text-xs text-rose-300 hover:bg-rose-900/40"
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReactivate(u.id)}
                            className="border-emerald-900/40 bg-emerald-950/20 text-xs text-emerald-300 hover:bg-emerald-900/40"
                          >
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
                <UserPlus className="h-5 w-5 text-sky-400" />
                Create New User
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                    {createError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Email</Label>
                  <Input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="rep@user.gmail.com"
                    className="border-slate-700 bg-[#232a34] text-slate-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Password</Label>
                  <Input
                    type="text"
                    required
                    minLength={4}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Temporary password"
                    className="border-slate-700 bg-[#232a34] text-slate-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Role</Label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as (typeof ROLES)[number])}
                    className="w-full rounded-md border border-slate-700 bg-[#232a34] px-3 py-2 text-sm text-slate-100"
                  >
                    {ROLES.filter((r) => r !== "CUSTOMER").map((r) => (
                      <option key={r} value={r}>
                        {r.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    CUSTOMER accounts self-provision at /login instead of being created here.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreating(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createSubmitting} className="bg-sky-500 font-semibold text-white hover:bg-sky-400">
                    {createSubmitting ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
