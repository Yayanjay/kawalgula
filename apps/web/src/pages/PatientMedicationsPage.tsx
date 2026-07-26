import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import api from "../lib/api";
import { useToast } from "../lib/toast";
import { Plus, Trash2, Bell, CalendarIcon, Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import EnrollmentQr from "../components/EnrollmentQr";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { cn } from "../lib/utils";
import type { PaginationResponse } from "@kawalgula/shared";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface MasterMedication {
  id: string;
  name: string;
  dosage: string;
  unit: string;
}

interface Assignment {
  id: string;
  medication: MasterMedication;
  scheduleTimes: string[];
  active: boolean;
}

interface Patient {
  id: string;
  name: string;
}

interface ConsumptionRow {
  id: string;
  patient: { name: string; waNumber: string } | null;
  patientMedication: { medication: { name: string } } | null;
  status: string;
  source: string;
  reportedAt: string;
}

export default function PatientMedicationsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [masterMeds, setMasterMeds] = useState<MasterMedication[]>([]);
  const [selectedMedId, setSelectedMedId] = useState("");
  const [scheduleInput, setScheduleInput] = useState("");
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [consumeRows, setConsumeRows] = useState<ConsumptionRow[]>([]);
  const [consumePagination, setConsumePagination] = useState<PaginationResponse | null>(null);
  const [consumePage, setConsumePage] = useState(1);
  const [consumeSearch, setConsumeSearch] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [summary, setSummary] = useState({ total: 0, taken: 0, skipped: 0, missed: 0 });
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const fetchData = async () => {
    try {
      const [patientRes, assignRes, masterRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.post("/patient-medications/list", { page: 1, size: 50, patientId: id }),
        api.post("/medications/list", { page: 1, size: 200 }),
      ]);
      setPatient(patientRes.data.data);
      setAssignments(assignRes.data.data);
      setMasterMeds(masterRes.data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const formatDate = (d: Date | undefined) => d ? format(d, "yyyy-MM-dd") : undefined;

  const fetchConsumption = async () => {
    try {
      const { data } = await api.post("/consumption/list", {
        patientId: id,
        page: consumePage,
        size: 15,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        search: consumeSearch ? { key: ["medicationName"], value: consumeSearch } : undefined,
      });
      setConsumeRows(data.data);
      setConsumePagination(data.pagination);
    } catch {
      // ignore
    }
  };

  const fetchSummary = async () => {
    try {
      const { data } = await api.post("/consumption/summary", {
        patientId: id,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      });
      setSummary(data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchConsumption(); }, [id, consumePage, consumeSearch, startDate, endDate]);
  useEffect(() => { fetchSummary(); }, [id, startDate, endDate]);

  const handleFilterReset = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setConsumeSearch("");
    setConsumePage(1);
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.post("/consumption/export", {
        patientId: id,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      }, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "consumption-export.csv";
      a.click();
    } catch {
      toast("Gagal mengekspor CSV", "error");
    }
  };

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF();
      const title = `Log Konsumsi - ${patient?.name || "-"}`;
      doc.setFontSize(14);
      doc.text(title, 14, 20);

      let subtitle = "";
      if (startDate || endDate) {
        const s = startDate ? format(startDate, "dd/MM/yyyy") : "-";
        const e = endDate ? format(endDate, "dd/MM/yyyy") : "-";
        subtitle = `Periode: ${s} - ${e}`;
        doc.setFontSize(10);
        doc.text(subtitle, 14, 28);
      }

      const headers = [["Tanggal", "Nama Pasien", "No. WA", "Obat", "Status"]];
      const body = consumeRows.map((r) => [
        new Date(r.reportedAt).toLocaleString("id-ID"),
        r.patient?.name || "-",
        r.patient?.waNumber || "-",
        r.patientMedication?.medication?.name || "-",
        statusLabels[r.status] || r.status,
      ]);

      autoTable(doc, {
        startY: subtitle ? 34 : 26,
        head: headers,
        body,
        styles: { fontSize: 8 },
      });

      doc.save("consumption-log.pdf");
      toast("PDF berhasil diexport");
    } catch {
      toast("Gagal mengekspor PDF", "error");
    }
  };

  const resetForm = () => {
    setSelectedMedId("");
    setScheduleInput("");
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedId) return;
    setSubmitting(true);
    const times = scheduleInput.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      if (editing) {
        await api.patch(`/patient-medications/${editing.id}`, { scheduleTimes: times });
        toast("Jadwal diperbarui");
      } else {
        await api.post("/patient-medications", { patientId: id, medicationId: selectedMedId, scheduleTimes: times });
        toast("Obat ditambahkan");
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
    setSubmitting(false);
  };

  const handleDelete = async (assignmentId: string) => {
    try {
      await api.delete(`/patient-medications/${assignmentId}`);
      fetchData();
      toast("Obat dihapus");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
  };

  const handleSendNow = async (assignmentId: string) => {
    try {
      const res = await api.post("/reminders/send-now", { patientMedicationId: assignmentId });
      toast(res.data?.data?.message || "Pengingat dikirim");
    } catch (err: any) {
      toast(err.response?.data?.message || "Gagal", "error");
    }
  };

  const handleEdit = (a: Assignment) => {
    setEditing(a);
    setSelectedMedId(a.medication.id);
    setScheduleInput(a.scheduleTimes.join(", "));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Obat {patient?.name || "..."}</h2>
          <p className="text-sm text-muted-foreground">Pilih obat dari daftar dan atur jadwal</p>
        </div>
      </div>

      {id && <EnrollmentQr patientId={id} />}

      <form onSubmit={handleSubmit} className="flex items-end gap-3 rounded-lg border p-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Obat</label>
          <select
            value={selectedMedId}
            onChange={(e) => setSelectedMedId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            disabled={!!editing}
          >
            <option value="">-- Pilih Obat --</option>
            {masterMeds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.dosage} {m.unit}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Jadwal WIB (pisahkan dengan koma)</label>
          <input
            type="text"
            value={scheduleInput}
            onChange={(e) => setScheduleInput(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="08:00, 20:00"
            required
          />
        </div>
        <div className="flex gap-2">
          {editing && (
            <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm">
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !selectedMedId}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "..." : editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {assignments.filter((a) => a.active).length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada obat</p>
        )}
        {assignments.filter((a) => a.active).map((a) => (
          <div key={a.id} className="flex items-start justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{a.medication.name} {a.medication.dosage} {a.medication.unit}</p>
              <p className="text-sm text-muted-foreground">
                Jadwal: {a.scheduleTimes.join(", ")} WIB
              </p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => handleSendNow(a.id)} className="rounded p-1 hover:bg-muted" title="Kirim pengingat">
                <Bell className="h-4 w-4" />
              </button>
              <button onClick={() => handleEdit(a)} className="rounded p-1 hover:bg-muted text-sm">Edit</button>
              <button onClick={() => setConfirmDelete(a.id)} className="rounded p-1 hover:bg-muted text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="Hapus Obat"
        message="Hapus obat ini? Pengingat akan dihapus, log konsumsi tetap tersimpan."
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      <hr className="my-6" />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Log Konsumsi</h3>
          <div className="flex gap-2">
            <button onClick={handleExportCsv} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={handleExportPdf} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <FileText className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-44 justify-start text-left font-normal text-sm", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Tanggal Mulai"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => { setStartDate(d); setStartDateOpen(false); setConsumePage(1); }}
                  captionLayout="dropdown"
                  fromYear={2020}
                  toYear={2035}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-44 justify-start text-left font-normal text-sm", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Tanggal Selesai"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(d) => { setEndDate(d); setEndDateOpen(false); setConsumePage(1); }}
                  captionLayout="dropdown"
                  fromYear={2020}
                  toYear={2035}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <input
            type="text"
            placeholder="Cari nama obat..."
            value={consumeSearch}
            onChange={(e) => { setConsumeSearch(e.target.value); setConsumePage(1); }}
            className="w-48 rounded-md border px-3 py-2 text-sm"
          />
          {(startDate || endDate || consumeSearch) && (
            <button onClick={handleFilterReset} className="text-sm text-muted-foreground hover:text-foreground underline">
              Reset filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{summary.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Seluruh catatan konsumsi</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Diminum</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{summary.taken}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pasien mengkonfirmasi minum obat</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Dilewati</p>
            <p className="text-2xl font-bold mt-1 text-yellow-600">{summary.skipped}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pasien memilih melewatkan dosis</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Terlewat</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{summary.missed}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pengingat tidak direspon, otomatis terlewat</p>
          </div>
        </div>

        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left">Tanggal</th>
                <th className="px-4 py-3 text-left">Nama Pasien</th>
                <th className="px-4 py-3 text-left">No. WA</th>
                <th className="px-4 py-3 text-left">Obat</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {consumeRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Belum ada data konsumsi</td></tr>
              )}
              {consumeRows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">{new Date(r.reportedAt).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-3 font-medium">{r.patient?.name || "-"}</td>
                  <td className="px-4 py-3">{r.patient?.waNumber || "-"}</td>
                  <td className="px-4 py-3">{r.patientMedication?.medication?.name || "-"}</td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {consumePagination && (
          <div className="flex items-center justify-between text-sm text-muted-foreground mt-3">
            <span>{consumePagination.total_item} log</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setConsumePage((p) => Math.max(1, p - 1))} disabled={consumePage <= 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span>{consumePagination.page} / {consumePagination.total_pages}</span>
              <button onClick={() => setConsumePage((p) => Math.min(consumePagination.total_pages, p + 1))} disabled={consumePage >= consumePagination.total_pages} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  taken: "Diminum",
  skipped: "Dilewati",
  missed: "Terlewat",
};

const statusColors: Record<string, string> = {
  taken: "bg-green-100 text-green-800",
  skipped: "bg-yellow-100 text-yellow-800",
  missed: "bg-red-100 text-red-800",
};

function statusBadge(status: string) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] || "bg-gray-100"}`}>
      {statusLabels[status] || status}
    </span>
  );
}
