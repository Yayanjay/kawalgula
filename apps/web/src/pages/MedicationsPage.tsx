import { useEffect, useState } from "react";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import type { PaginationResponse } from "@kawalgula/shared";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  unit: string;
}

export default function MedicationsPage() {
  const { toast } = useToast();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [pagination, setPagination] = useState<PaginationResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [form, setForm] = useState({ name: "", dosage: "", unit: "" });
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);

  const fetchMeds = async () => {
    try {
      const { data } = await api.post("/medications/list", {
        page,
        size: 10,
        search: search ? { key: ["name"], value: search } : undefined,
        sort: [{ key: "createdAt", direction: "DESC" }],
      });
      setMeds(data.data);
      setPagination(data.pagination);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchMeds(); }, [page, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", dosage: "", unit: "" });
    setShowModal(true);
  };

  const openEdit = (m: Medication) => {
    setEditing(m);
    setForm({ name: m.name, dosage: m.dosage, unit: m.unit });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/medications/${editing.id}`, form);
        toast("Obat diperbarui");
      } else {
        await api.post("/medications", form);
        toast("Obat ditambahkan");
      }
      setShowModal(false);
      fetchMeds();
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/medications/${id}`);
      fetchMeds();
      toast("Obat dihapus");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Data Obat</h2>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Plus className="h-4 w-4" /> Tambah Obat
        </button>
      </div>

      <input
        type="text"
        placeholder="Cari nama obat..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
      />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">Nama Obat</th>
              <th className="px-4 py-3 text-left">Dosis</th>
              <th className="px-4 py-3 text-left">Satuan</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {meds.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Belum ada data obat</td></tr>
            )}
            {meds.map((m) => (
              <tr key={m.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3">{m.dosage}</td>
                <td className="px-4 py-3">{m.unit}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(m)} className="rounded p-1 hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setConfirmDialog({ id: m.id })} className="rounded p-1 hover:bg-muted text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{pagination.total_item} obat</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span>{pagination.page} / {pagination.total_pages}</span>
            <button onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={page >= pagination.total_pages} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDialog}
        onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}
        title="Hapus Obat"
        message="Hapus obat ini? Obat yang sudah di-assign ke pasien juga akan terhapus."
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          if (confirmDialog) handleDelete(confirmDialog.id);
          setConfirmDialog(null);
        }}
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editing ? "Edit Obat" : "Tambah Obat"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nama Obat</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Metformin" required />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium">Dosis</label>
                  <input type="text" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="500mg" required />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium">Satuan</label>
                  <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="tablet" required />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-md border px-4 py-2 text-sm">Batal</button>
                <button type="submit" disabled={submitting} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {submitting ? "Menyimpan..." : editing ? "Simpan" : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
