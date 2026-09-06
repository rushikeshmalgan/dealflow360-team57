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
  ADMIN: "border-rose-400/30 bg-rose-400/10 text-rose-700",
  SALES_REP: "border-sky-400/30 bg-sky-400/10 text-sky-700",
  MANAGER: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  FINANCE_OPS: "border-purple-400/30 bg-purple-400/10 text-purple-700",
  CUSTOMER: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700",
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
      <div className="min-h-screen bg-sky-50 text-slate-900">
        <DealFlowNav />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <ShieldOff className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Administrator access required</h1>
          <p className="mt-2 text-sm text-slate-500">Only ADMIN accounts can manage users.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <DealFlowNav />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-6">
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="text-xs font-semibold tracking-wider text-sky-600 uppercase">
                Admin
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Users &amp; Role-Based Login
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
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
                className="border-sky-200 bg-white text-slate-800 hover:bg-sky-100"
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
              <div key={role} className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{role.replace("_", " ")}</span>
                  <UsersIcon className="h-4 w-4 text-slate-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {users?.filter((u) => u.role === role).length ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-sky-100 bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-600 uppercase">
            All Accounts
          </h2>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading users...</div>
          ) : (users ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No users yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-sky-100 hover:bg-transparent">
                    <TableHead className="text-slate-600">Email</TableHead>
                    <TableHead className="text-slate-600">Role</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-slate-600">Created</TableHead>
                    <TableHead className="text-right text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users ?? []).map((u) => (
                    <TableRow key={u.id} className="border-sky-100 transition-colors hover:bg-sky-50">
                      <TableCell className="font-medium text-slate-900">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={`border px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[u.role] ?? ""}`}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`border text-xs ${
                            u.isActive
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700"
                              : "border-slate-300 bg-slate-100 text-slate-500"
                          }`}
                        >
                          {u.isActive ? "Active" : "Deactivated"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeactivate(u.id)}
                            className="border-rose-900/40 bg-rose-950/20 text-xs text-rose-700 hover:bg-rose-900/40"
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReactivate(u.id)}
                            className="border-emerald-900/40 bg-emerald-950/20 text-xs text-emerald-700 hover:bg-emerald-900/40"
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
          <Card className="w-full max-w-md border-sky-100 bg-sky-50 text-slate-900 shadow-2xl">
            <CardHeader className="border-b border-sky-100 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <UserPlus className="h-5 w-5 text-sky-600" />
                Create New User
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-700">
                    {createError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Email</Label>
                  <Input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="rep@user.gmail.com"
                    className="border-sky-100 bg-white text-slate-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Password</Label>
                  <Input
                    type="text"
                    required
                    minLength={4}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Temporary password"
                    className="border-sky-100 bg-white text-slate-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Role</Label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as (typeof ROLES)[number])}
                    className="w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
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
                    className="border-sky-100 text-slate-600 hover:bg-white"
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
