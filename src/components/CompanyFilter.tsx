"use client";

/** Shared company filter control for Super Admin lists. */
export default function CompanyFilter({
  companies,
  value,
  onChange,
  includeUnassigned = true,
}: {
  companies: { companyId: string; name: string }[];
  value: string;
  onChange: (companyId: string) => void;
  includeUnassigned?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <label className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
        Company
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-md text-sm outline-none"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
        }}
      >
        <option value="">All companies</option>
        {includeUnassigned && <option value="__none__">Unassigned</option>}
        {companies.map((c) => (
          <option key={c.companyId} value={c.companyId}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
