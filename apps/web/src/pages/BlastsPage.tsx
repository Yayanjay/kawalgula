import { useEffect, useState, useRef } from "react";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import { Send, Trash2, Upload, Image, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationResponse } from "@kawalgula/shared";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Blast {
  id: string;
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  status: string;
  sentAt: string | null;
  totalRecipients: number;
  successCount: number;
  failCount: number;
  createdAt: string;
}

interface BlastRecipient {
  id: string;
  patientName: string;
  waNumber: string;
  status: string;
  wahaMessageId: string | null;
  error: string | null;
  sentAt: string | null;
}

const statusLabels: Record<string, string> = {
  draft: "Draf",
  sending: "Mengirim",
  sent: "Terkirim",
  cancelled: "Dibatalkan",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const recipientStatusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function BlastsPage() {
  const { toast } = useToast();
  const [blasts, setBlasts] = useState<Blast[]>([]);
  const [pagination, setPagination] = useState<PaginationResponse | null>(null);
  const [page, setPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBlast, setSelectedBlast] = useState<Blast | null>(null);
  const [recipients, setRecipients] = useState<BlastRecipient[]>([]);
  const [form, setForm] = useState({ title: "", body: "", mediaUrl: "", mediaType: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRetry, setConfirmRetry] = useState<string | null>(null);

  const displayed = showHistory ? blasts : blasts.filter((b) => b.status === "draft");

  const fetchBlasts = async () => {
    try {
      const { data } = await api.post("/blasts/list", {
        page,
        size: 50,
        sort: [{ key: "createdAt", direction: "DESC" }],
      });
      setBlasts(data.data);
      setPagination(data.pagination);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchBlasts(); }, [page]);

  const openCreate = () => {
    setForm({ title: "", body: "", mediaUrl: "", mediaType: "" });
    setShowCreate(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/uploads/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, mediaUrl: data.data.url, mediaType: file.type }));
      toast("Gambar berhasil diunggah");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal mengunggah gambar", "error");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/blasts", {
        title: form.title,
        body: form.body,
        mediaUrl: form.mediaUrl || undefined,
        mediaType: form.mediaType || undefined,
      });
      setShowCreate(false);
      fetchBlasts();
      toast("Broadcast berhasil dibuat");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal membuat broadcast", "error");
    }
    setSubmitting(false);
  };

  const handleSend = async (id: string) => {
    setSending(true);
    try {
      await api.post(`/blasts/${id}/send`);
      fetchBlasts();
      toast("Broadcast sedang dikirim");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal mengirim broadcast", "error");
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/blasts/${id}`);
      if (selectedBlast?.id === id) setSelectedBlast(null);
      fetchBlasts();
      toast("Broadcast dihapus");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal menghapus", "error");
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await api.post(`/blasts/${id}/retry-failed`);
      fetchBlasts();
      toast("Pengiriman ulang selesai");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal mengirim ulang", "error");
    }
  };

  const openDetail = async (blast: Blast) => {
    setSelectedBlast(blast);
    try {
      const { data } = await api.get(`/blasts/${blast.id}`);
      setRecipients(data.data.recipients || []);
    } catch {
      setRecipients([]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Broadcast</h2>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Send className="h-4 w-4" /> Buat Broadcast
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowHistory(false)}
          className={`rounded-full px-4 py-1 text-sm border transition-colors ${!showHistory ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
        >
          Broadcast Aktif
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className={`rounded-full px-4 py-1 text-sm border transition-colors ${showHistory ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
        >
          Riwayat
        </button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">Judul</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Penerima</th>
              <th className="px-4 py-3 text-right">Berhasil</th>
              <th className="px-4 py-3 text-right">Gagal</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{showHistory ? "Belum ada riwayat broadcast" : "Belum ada broadcast draft"}</td></tr>
            )}
            {displayed.map((b) => (
              <tr key={b.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <button onClick={() => openDetail(b)} className="font-medium text-left hover:underline">
                    {b.title}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[b.status] || ""}`}>
                    {statusLabels[b.status] || b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{b.totalRecipients}</td>
                <td className="px-4 py-3 text-right text-green-600">{b.successCount}</td>
                <td className="px-4 py-3 text-right text-red-600">{b.failCount}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {b.status === "draft" && (
                      <>
                        <button onClick={() => setConfirmSend(b.id)} disabled={sending} className="rounded p-1 hover:bg-muted text-blue-600" title="Kirim">
                          <Send className="h-4 w-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(b.id)} className="rounded p-1 hover:bg-muted text-red-500" title="Hapus">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {b.status === "sent" && b.failCount > 0 && (
                      <button onClick={() => setConfirmRetry(b.id)} className="rounded p-1 hover:bg-muted text-amber-600" title="Kirim ulang yang gagal">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{pagination.total_item} broadcast</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span>{pagination.page} / {pagination.total_pages}</span>
            <button onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={page >= pagination.total_pages} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {selectedBlast && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{selectedBlast.title}</h3>
            <div className="flex items-center gap-2">
              {selectedBlast.status === "sent" && selectedBlast.failCount > 0 && (
                <button onClick={() => setConfirmRetry(selectedBlast.id)} className="flex items-center gap-1 rounded-md border border-amber-200 text-amber-700 px-2 py-1 text-xs hover:bg-amber-50">
                  <RefreshCw className="h-3 w-3" /> Retry Gagal
                </button>
              )}
              <button onClick={() => setSelectedBlast(null)} className="text-xs text-muted-foreground hover:text-foreground">Tutup</button>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{selectedBlast.body}</p>
          {selectedBlast.mediaUrl && (
            <img src={selectedBlast.mediaUrl} alt="" className="rounded-lg max-h-48 object-cover" />
          )}
          <div className="text-xs text-muted-foreground">
            {selectedBlast.totalRecipients} penerima &middot; {selectedBlast.successCount} berhasil &middot; {selectedBlast.failCount} gagal
            {selectedBlast.sentAt && <> &middot; {new Date(selectedBlast.sentAt).toLocaleString("id")}</>}
          </div>
          {recipients.length > 0 && (
            <div className="rounded border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left">Nama</th>
                    <th className="px-3 py-2 text-left">No. WA</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.patientName}</td>
                      <td className="px-3 py-2">{r.waNumber}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${recipientStatusColors[r.status] || ""}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-red-500">{r.error || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmSend}
        onOpenChange={(o) => { if (!o) setConfirmSend(null); }}
        title="Kirim Broadcast"
        message="Kirim broadcast ini ke semua pasien yang sudah setuju?"
        confirmLabel="Kirim"
        onConfirm={() => {
          if (confirmSend) handleSend(confirmSend);
          setConfirmSend(null);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="Hapus Broadcast"
        message="Hapus broadcast draft ini?"
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!confirmRetry}
        onOpenChange={(o) => { if (!o) setConfirmRetry(null); }}
        title="Kirim Ulang"
        message="Kirim ulang ke penerima yang gagal?"
        confirmLabel="Kirim Ulang"
        onConfirm={() => {
          if (confirmRetry) handleRetry(confirmRetry);
          setConfirmRetry(null);
        }}
      />

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Buat Broadcast Baru</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-sm font-medium">Judul</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="text-sm font-medium">Isi Pesan</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} className="w-full rounded-md border px-3 py-2 text-sm" required />
                <p className="text-xs text-muted-foreground mt-1">Gunakan <code className="bg-muted px-1 rounded">{`{{name}}`}</code> untuk nama pasien</p>
              </div>
              <div>
                <label className="text-sm font-medium">Gambar (opsional)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    ref={fileRef}
                    onChange={handleUpload}
                    className="hidden"
                  />
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                    <Image className="h-4 w-4" /> Pilih Gambar
                  </button>
                  {form.mediaUrl && (
                    <span className="text-xs text-green-600">Gambar terpilih</span>
                  )}
                </div>
                {form.mediaUrl && (
                  <img src={form.mediaUrl} alt="" className="mt-2 rounded-lg max-h-32 object-cover" />
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-md border px-4 py-2 text-sm">Batal</button>
                <button type="submit" disabled={submitting} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {submitting ? "Menyimpan..." : "Simpan Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
