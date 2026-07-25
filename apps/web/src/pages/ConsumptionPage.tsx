import { useEffect, useState } from "react";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import type { PaginationResponse } from "@kawalgula/shared";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

interface ConsumptionRow {
  id: string;
  patient: { name: string; waNumber: string } | null;
  patientMedication: { medication: { name: string } } | null;
  status: string;
  source: string;
  reportedAt: string;
}

const statusLabels: Record<string, string> = {
  taken: "Diminum",
  skipped: "Dilewati",
  missed: "Terlewat",
};

const sourceLabels: Record<string, string> = {
  button: "Tombol",
  free_text: "Teks",
  system_missed: "Sistem",
};

export default function ConsumptionPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConsumptionRow[]>([]);
  const [pagination, setPagination] = useState<PaginationResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    try {
      const { data } = await api.post("/consumption/list", {
        page,
        size: 15,
        search: search ? { key: ["patientName", "medicationName"], value: search } : undefined,
      });
      setRows(data.data);
      setPagination(data.pagination);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchData(); }, [page, search]);

  const handleExport = async () => {
    try {
      const response = await api.post("/consumption/export", { search: search ? { key: ["patientName", "medicationName"], value: search } : undefined }, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "consumption-export.csv";
      a.click();
    } catch {
      toast("Gagal mengekspor", "error");
    }
  };

  const statusBadge = (status: string) => {
    const color: Record<string, string> = {
      taken: "bg-green-100 text-green-800",
      skipped: "bg-yellow-100 text-yellow-800",
      missed: "bg-red-100 text-red-800",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color[status] || "bg-gray-100"}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Log Konsumsi</h2>
        <button onClick={handleExport} className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          <Download className="h-4 w-4" /> Ekspor CSV
        </button>
      </div>

      <input
        type="text"
        placeholder="Cari nama pasien atau obat..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
      />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">Tanggal</th>
              <th className="px-4 py-3 text-left">Pasien</th>
              <th className="px-4 py-3 text-left">No. WA</th>
              <th className="px-4 py-3 text-left">Obat</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Sumber</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Belum ada data konsumsi</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">{new Date(r.reportedAt).toLocaleString("id-ID")}</td>
                <td className="px-4 py-3 font-medium">{r.patient?.name || "-"}</td>
                <td className="px-4 py-3">{r.patient?.waNumber || "-"}</td>
                <td className="px-4 py-3">{r.patientMedication?.medication?.name || "-"}</td>
                <td className="px-4 py-3">{statusBadge(r.status)}</td>
                <td className="px-4 py-3 text-muted-foreground">{sourceLabels[r.source] || r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{pagination.total_item} log</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span>{pagination.page} / {pagination.total_pages}</span>
            <button onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={page >= pagination.total_pages} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
