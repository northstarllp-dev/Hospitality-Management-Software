"use client";

import { useState } from "react";
import type { User, Company, House } from "@/data/types";
import { useCollection } from "@/lib/firebase/hooks";
import { db } from "@/lib/firebase/config";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { createId } from "@/lib/ids";
import { canManageCompanies, normalizeRole } from "@/lib/permissions";
import { useToast } from "@/components/ToastProvider";
import type { Page } from "@/components/Layout";

interface Props {
  currentUser: User;
  onNavigate?: (page: Page, params?: Record<string, string>) => void;
}

export default function Companies({ currentUser, onNavigate }: Props) {
  const toast = useToast();
  const { data: companies, loading } = useCollection<Company>("companies");
  const { data: houses } = useCollection<House>("houses");
  const { data: users } = useCollection<User>("users");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    notes: "",
  });

  if (!canManageCompanies(currentUser)) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
        Only Super Admin can manage companies.
      </div>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Company name is required.");
      return;
    }
    setSaving(true);
    try {
      const companyId = createId("co");
      await setDoc(doc(db, "companies", companyId), {
        companyId,
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        contactEmail: form.contactEmail.trim(),
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      } satisfies Company);
      setForm({ name: "", contactName: "", contactPhone: "", contactEmail: "", notes: "" });
      setShowAdd(false);
      toast.success("Company added.");
    } catch (err) {
      console.error(err);
      toast.error("Could not add company.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company: Company) => {
    const linked = houses.filter((h) => h.companyId === company.companyId).length;
    const linkedUsers = users.filter(
      (u) => u.companyId === company.companyId && normalizeRole(u.role) !== "superadmin"
    ).length;
    if (linked > 0 || linkedUsers > 0) {
      toast.error(
        `Move or unlink ${linked} propert${linked === 1 ? "y" : "ies"} and ${linkedUsers} login${linkedUsers === 1 ? "" : "s"} first.`
      );
      return;
    }
    if (!window.confirm(`Delete company “${company.name}”?`)) return;
    try {
      await deleteDoc(doc(db, "companies", company.companyId));
      toast.success("Company deleted.");
    } catch (err) {
      console.error(err);
      toast.error("Could not delete company.");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center" style={{ color: "var(--muted-foreground)" }}>
        Loading companies…
      </div>
    );
  }

  const inputStyle = {
    background: "var(--background)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
  } as const;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{ fontFamily: "DM Serif Display, serif", color: "var(--foreground)" }}
          >
            Companies
          </h1>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {companies.length} compan{companies.length === 1 ? "y" : "ies"} · assign properties under each
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="px-3 py-1.5 rounded-md text-sm font-semibold"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {showAdd ? "Cancel" : "Add Company"}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg p-5 mb-6 space-y-3"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <input
            required
            placeholder="Company name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 rounded text-sm"
            style={inputStyle}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              placeholder="Contact name"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className="px-3 py-2 rounded text-sm"
              style={inputStyle}
            />
            <input
              placeholder="Phone"
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              className="px-3 py-2 rounded text-sm"
              style={inputStyle}
            />
            <input
              placeholder="Email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="px-3 py-2 rounded text-sm"
              style={inputStyle}
            />
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 rounded text-sm"
            rows={2}
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {saving ? "Saving…" : "Save Company"}
          </button>
        </form>
      )}

      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {companies.length === 0 && (
          <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            No companies yet. Add one to group properties by owner organization.
          </div>
        )}
        {companies.map((company, i) => {
          const propCount = houses.filter((h) => h.companyId === company.companyId).length;
          const loginCount = users.filter(
            (u) => u.companyId === company.companyId && normalizeRole(u.role) !== "superadmin"
          ).length;
          return (
            <div
              key={company.companyId}
              className="flex items-center gap-4 px-5 py-4"
              style={{ borderBottom: i < companies.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  {company.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {propCount} propert{propCount === 1 ? "y" : "ies"} · {loginCount} login
                  {loginCount === 1 ? "" : "s"}
                  {company.contactName ? ` · ${company.contactName}` : ""}
                </div>
              </div>
              {onNavigate && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onNavigate("houses", { companyId: company.companyId })}
                    className="text-xs px-3 py-1.5 rounded font-medium"
                    style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
                  >
                    Properties
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("staff", { companyId: company.companyId })}
                    className="text-xs px-3 py-1.5 rounded font-medium"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    Logins
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => handleDelete(company)}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: "var(--status-occupied-bg)", color: "var(--status-occupied)" }}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
