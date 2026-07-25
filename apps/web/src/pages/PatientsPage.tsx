import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import type { PaginationResponse } from "@kawalgula/shared";
import { UserPlus, Send, Pencil, Trash2, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { cn } from "../lib/utils";

interface Patient {
  id: string;
  name: string;
  waNumber: string;
  dob: string | null;
  consentStatus: string;
  _count: { patientMedications: number };
}

export default function PatientsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pagination, setPagination] = useState<PaginationResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState({ name: "", waNumber: "", dob: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchPatients = async () => {
    try {
      const { data } = await api.post("/patients/list", {
        page,
        size: 10,
        search: search ? { key: ["name", "waNumber"], value: search } : undefined,
        sort: [{ key: "createdAt", direction: "DESC" }],
      });
      setPatients(data.data);
      setPagination(data.pagination);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchPatients(); }, [page, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", waNumber: "", dob: "" });
    setShowModal(true);
  };

  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({ name: p.name, waNumber: p.waNumber, dob: p.dob ? format(new Date(p.dob), "yyyy-MM-dd") : "" });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/patients/${editing.id}`, { name: form.name, dob: form.dob || null });
      } else {
        await api.post("/patients", { name: form.name, waNumber: form.waNumber, dob: form.dob || null });
      }
      setShowModal(false);
      fetchPatients();
      toast(editing ? "Pasien berhasil diperbarui" : "Pasien berhasil ditambahkan");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
    setSubmitting(false);
  };

  const handleResend = async (id: string) => {
    try {
      await api.post(`/patients/${id}/resend-optin`);
      toast("Opt-in dikirim ulang");
    } catch {
      toast("Gagal mengirim ulang opt-in", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pasien ini? Log konsumsi tetap tersimpan.")) return;
    try {
      await api.delete(`/patients/${id}`);
      fetchPatients();
      toast("Pasien dihapus");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
  };

  const consentBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      opted_in: "bg-green-100 text-green-800",
      opted_out: "bg-red-100 text-red-800",
    };
    const label: Record<string, string> = {
      pending: "Menunggu",
      opted_in: "Setuju",
      opted_out: "Menolak",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || "bg-gray-100"}`}>
        {label[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Data Pasien</h2>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <UserPlus className="h-4 w-4" /> Tambah Pasien
        </button>
      </div>

      <input
        type="text"
        placeholder="Cari nama atau nomor WA..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
      />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">Nama</th>
              <th className="px-4 py-3 text-left">No. WA</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Obat</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Belum ada data pasien</td></tr>
            )}
            {patients.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-medium cursor-pointer" onClick={() => navigate(`/patients/${p.id}/medications`)}>{p.name}</td>
                <td className="px-4 py-3">{p.waNumber}</td>
                <td className="px-4 py-3">{consentBadge(p.consentStatus)}</td>
                <td className="px-4 py-3">{p._count.patientMedications}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(p.consentStatus === "pending" || p.consentStatus === "opted_out") && (
                      <button onClick={() => handleResend(p.id)} className="rounded p-1 hover:bg-muted" title="Kirim ulang opt-in">
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} className="rounded p-1 hover:bg-muted" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="rounded p-1 hover:bg-muted text-red-500" title="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{pagination.total_item} pasien</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span>{pagination.page} / {pagination.total_pages}</span>
            <button onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={page >= pagination.total_pages} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editing ? "Edit Pasien" : "Tambah Pasien"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nama</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" required />
              </div>
              {!editing && (
                <div>
                  <label className="text-sm font-medium">No. WhatsApp</label>
                  <input type="text" value={form.waNumber} onChange={(e) => setForm({ ...form, waNumber: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="6281234567890" required />
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Tanggal Lahir</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !form.dob && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.dob ? format(new Date(form.dob), "dd/MM/yyyy") : <span>Pilih tanggal</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.dob ? new Date(form.dob) : undefined}
                      onSelect={(date) => setForm({ ...form, dob: date ? format(date, "yyyy-MM-dd") : "" })}
                      captionLayout="dropdown-buttons"
                      fromYear={1950}
                      toYear={new Date().getFullYear()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
